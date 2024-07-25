// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { PowerLevelAction } from "matrix-bot-sdk/lib/models/PowerLevelAction";
import { LogService, UserID } from "matrix-bot-sdk";
import { htmlToText } from "html-to-text";
import { htmlEscape } from "../utils";
import { JSDOM } from "jsdom";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomReference,
  ReactionContent,
  RoomEvent,
  RoomMessage,
  StringEventID,
  StringRoomID,
  StringUserID,
  Task,
  TextMessageContent,
  Value,
  isError,
  serverName,
} from "matrix-protection-suite";

/// Regexp, used to extract the action label from an action reaction
/// such as `⚽ Kick user @foobar:localhost from room [kick-user]`.
const REACTION_ACTION = /\[([a-z-]*)\]$/;

/// Regexp, used to extract the action label from a confirmation reaction
/// such as `🆗 ⚽ Kick user @foobar:localhost from room? [kick-user][confirm]`.
const REACTION_CONFIRMATION = /\[([a-z-]*)\]\[([a-z-]*)\]$/;

/// The hardcoded `confirm` string, as embedded in confirmation reactions.
const CONFIRM = "confirm";
/// The hardcoded `cancel` string, as embedded in confirmation reactions.
const CANCEL = "cancel";

/// Custom field embedded as part of notifications to embed abuse reports
/// (see `IReport` for the content).
export const ABUSE_REPORT_KEY = "org.matrix.mjolnir.abuse.report";

/// Custom field embedded as part of confirmation reactions to embed abuse
/// reports (see `IReportWithAction` for the content).
export const ABUSE_ACTION_CONFIRMATION_KEY =
  "org.matrix.mjolnir.abuse.action.confirmation";

const NATURE_DESCRIPTIONS_LIST: [string, string][] = [
  ["org.matrix.msc3215.abuse.nature.disagreement", "disagreement"],
  ["org.matrix.msc3215.abuse.nature.harassment", "harassment/bullying"],
  [
    "org.matrix.msc3215.abuse.nature.csam",
    "child sexual abuse material [likely illegal, consider warning authorities]",
  ],
  ["org.matrix.msc3215.abuse.nature.hate_speech", "spam"],
  ["org.matrix.msc3215.abuse.nature.spam", "impersonation"],
  ["org.matrix.msc3215.abuse.nature.impersonation", "impersonation"],
  [
    "org.matrix.msc3215.abuse.nature.doxxing",
    "non-consensual sharing of identifiable private information of a third party (doxxing)",
  ],
  [
    "org.matrix.msc3215.abuse.nature.violence",
    "threats of violence or death, either to self or others",
  ],
  [
    "org.matrix.msc3215.abuse.nature.terrorism",
    "terrorism [likely illegal, consider warning authorities]",
  ],
  [
    "org.matrix.msc3215.abuse.nature.unwanted_sexual_advances",
    "unwanted sexual advances, sextortion, ... [possibly illegal, consider warning authorities]",
  ],
  [
    "org.matrix.msc3215.abuse.nature.ncii",
    "non consensual intimate imagery, including revenge porn",
  ],
  [
    "org.matrix.msc3215.abuse.nature.nsfw",
    "NSFW content (pornography, gore...) in a SFW room",
  ],
  ["org.matrix.msc3215.abuse.nature.disinformation", "disinformation"],
];
const NATURE_DESCRIPTIONS = new Map(NATURE_DESCRIPTIONS_LIST);

enum Kind {
  //! A MSC3215-style moderation request
  MODERATION_REQUEST,
  //! An abuse report, as per https://matrix.org/docs/spec/client_server/r0.6.1#post-matrix-client-r0-rooms-roomid-report-eventid
  SERVER_ABUSE_REPORT,
  //! Mjölnir encountered a problem while attempting to handle a moderation request or abuse report
  ERROR,
  //! A moderation request or server abuse report escalated by the server/room moderators.
  ESCALATED_REPORT,
}

/**
 * A class designed to respond to abuse reports.
 */
export class ReportManager {
  private displayManager: DisplayManager;
  constructor(public draupnir: Draupnir) {
    this.displayManager = new DisplayManager(this);
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    if (
      roomID === this.draupnir.managementRoomID &&
      event.type === "m.reaction"
    ) {
      void Task(this.handleReaction({ roomID, event }));
    }
  }

  /**
   * Display an incoming abuse report received, e.g. from the /report Matrix API.
   *
   * # Pre-requisites
   *
   * The following MUST hold true:
   * - the reporter's id is `reporterId`;
   * - the reporter is a member of `roomID`;
   * - `event` did take place in room `roomID`;
   * - the reporter could witness event `event` in room `roomID`;
   * - the event being reported is `event`;
   *
   * @param roomID The room in which the abuse took place.
   * @param reporterId The user who reported the event.
   * @param event The event being reported.
   * @param reason A reason provided by the reporter.
   */
  public async handleServerAbuseReport({
    roomID,
    reporterId,
    event,
    reason,
  }: {
    roomID: StringRoomID;
    reporterId: string;
    event: RoomEvent;
    reason?: string;
  }) {
    this.draupnir.handleEventReport({
      event_id: event.event_id,
      room_id: roomID,
      sender: reporterId as StringUserID,
      event: event,
      ...(reason === undefined ? {} : { reason }),
    });
    if (this.draupnir.config.displayReports) {
      return this.displayManager.displayReportAndUI({
        kind: Kind.SERVER_ABUSE_REPORT,
        event,
        reporterId,
        moderationroomID: this.draupnir.managementRoomID,
        ...(reason === undefined ? {} : { reason }),
      });
    }
  }

  /**
   * Handle a reaction to an abuse report.
   *
   * @param roomID The room in which the reaction took place.
   * @param event The reaction.
   */
  public async handleReaction({
    roomID,
    event,
  }: {
    roomID: StringRoomID;
    event: RoomEvent;
  }) {
    if (event.sender === this.draupnir.clientUserID) {
      // Let's not react to our own reactions.
      return;
    }

    if (roomID !== this.draupnir.managementRoomID) {
      // Let's not accept commands in rooms other than the management room.
      return;
    }
    const reactionContent = Value.Decode(ReactionContent, event.content);
    if (isError(reactionContent)) {
      return;
    }
    const relation = reactionContent.ok["m.relates_to"];
    if (relation === undefined) {
      return;
    }

    // Get the original event.
    let initialNoticeReport: IReport | undefined,
      confirmationReport: IReportWithAction | undefined;
    try {
      const originalEvent = await this.draupnir.client.getEvent(
        roomID,
        relation.event_id
      );
      if (originalEvent.sender !== this.draupnir.clientUserID) {
        // Let's not handle reactions to events we didn't send as
        // some setups have two or more Mjolnir's in the same management room.
        return;
      }
      if (!("content" in originalEvent)) {
        return;
      }
      const content = originalEvent["content"];
      if (ABUSE_REPORT_KEY in content) {
        initialNoticeReport = content[ABUSE_REPORT_KEY];
      } else if (ABUSE_ACTION_CONFIRMATION_KEY in content) {
        confirmationReport = content[ABUSE_ACTION_CONFIRMATION_KEY];
      }
    } catch (ex) {
      return;
    }
    if (!initialNoticeReport && !confirmationReport) {
      return;
    }

    /*
        At this point, we know that:

        - We're in the management room;
        - Either
            - `initialNoticeReport` is defined and we're reacting to one of our reports; or
            - `confirmationReport` is defined and we're reacting to a confirmation request.
        */

    if (confirmationReport) {
      // Extract the action and the decision.
      const matches = relation.key?.match(REACTION_CONFIRMATION);
      if (!matches) {
        // Invalid key.
        return;
      }

      // Is it a yes or a no?
      let decision;
      switch (matches[2]) {
        case CONFIRM:
          decision = true;
          break;
        case CANCEL:
          decision = false;
          break;
        default:
          LogService.debug(
            "ReportManager::handleReaction",
            "Unknown decision",
            matches[2]
          );
          return;
      }
      const label = matches[1];
      if (label === undefined) {
        LogService.error(
          "ReportManager::handleReaction",
          "Unable to find the label for an event",
          event
        );
        return;
      }
      if (decision) {
        LogService.info(
          "ReportManager::handleReaction",
          "User",
          event["sender"],
          "confirmed action",
          matches[1]
        );
        await this.executeAction({
          label,
          report: confirmationReport,
          successEventId:
            confirmationReport.notification_event_id as StringEventID,
          failureEventId: relation.event_id,
          onSuccessRemoveEventId: relation.event_id,
          moderationRoomId: roomID,
        });
      } else {
        LogService.info(
          "ReportManager::handleReaction",
          "User",
          event["sender"],
          "cancelled action",
          matches[1]
        );
        await this.draupnir.client.redactEvent(
          this.draupnir.managementRoomID,
          relation.event_id,
          "Action cancelled"
        );
      }

      return;
    } else if (initialNoticeReport) {
      const matches = relation.key?.match(REACTION_ACTION);
      if (!matches) {
        // Invalid key.
        return;
      }

      const label = matches[1];
      if (label === undefined) {
        return;
      }
      const action: IUIAction | undefined = ACTIONS.get(label);
      if (!action) {
        return;
      }
      confirmationReport = {
        action: label,
        notification_event_id: relation.event_id,
        ...initialNoticeReport,
      };
      LogService.info(
        "ReportManager::handleReaction",
        "User",
        event["sender"],
        "picked action",
        label,
        initialNoticeReport
      );
      if (action.needsConfirmation) {
        // Send a confirmation request.
        const confirmation = {
          msgtype: "m.notice",
          body: `${action.emoji} ${await action.title(this, initialNoticeReport)}?`,
          "m.relationship": {
            rel_type: "m.reference",
            event_id: relation.event_id,
          },
          [ABUSE_ACTION_CONFIRMATION_KEY]: confirmationReport,
        };

        const requestConfirmationEventId =
          await this.draupnir.client.sendMessage(
            this.draupnir.managementRoomID,
            confirmation
          );
        await this.draupnir.client.sendEvent(
          this.draupnir.managementRoomID,
          "m.reaction",
          {
            "m.relates_to": {
              rel_type: "m.annotation",
              event_id: requestConfirmationEventId,
              key: `🆗 ${action.emoji} ${await action.title(this, initialNoticeReport)} [${action.label}][${CONFIRM}]`,
            },
          }
        );
        await this.draupnir.client.sendEvent(
          this.draupnir.managementRoomID,
          "m.reaction",
          {
            "m.relates_to": {
              rel_type: "m.annotation",
              event_id: requestConfirmationEventId,
              key: `⬛ Cancel [${action.label}][${CANCEL}]`,
            },
          }
        );
        // FIXME: We've clobbered the roomID parts on all of these events.
      } else {
        // Execute immediately.
        LogService.info(
          "ReportManager::handleReaction",
          "User",
          event["sender"],
          "executed (no confirmation needed) action",
          matches[1]
        );
        void this.executeAction({
          label,
          report: confirmationReport,
          successEventId: relation.event_id,
          failureEventId: relation.event_id,
          moderationRoomId: roomID,
        });
      }
    }
  }

  /**
   * Execute a report-specific action.
   *
   * This is executed when the user clicks on an action to execute (if the action
   * does not need confirmation) or when the user clicks on "confirm" in a confirmation
   * (otherwise).
   *
   * @param label The type of action to execute, e.g. `kick-user`.
   * @param report The abuse report on which to take action.
   * @param successEventId The event to annotate with a "OK" in case of success.
   * @param failureEventId The event to annotate with a "FAIL" in case of failure.
   * @param onSuccessRemoveEventId Optionally, an event to remove in case of success (e.g. the confirmation dialog).
   */
  private async executeAction({
    label,
    report,
    successEventId,
    failureEventId,
    onSuccessRemoveEventId,
    moderationRoomId,
  }: {
    label: string;
    report: IReportWithAction;
    successEventId: StringEventID;
    failureEventId: StringEventID;
    onSuccessRemoveEventId?: StringEventID;
    moderationRoomId: StringRoomID;
  }) {
    const action: IUIAction | undefined = ACTIONS.get(label);
    if (!action) {
      return;
    }
    try {
      // Check security.
      if (moderationRoomId === this.draupnir.managementRoomID) {
        // Always accept actions executed from the management room.
      } else {
        throw new Error("Security error: Cannot execute this action.");
      }
      const response = await action.execute(
        this,
        report,
        moderationRoomId,
        this.displayManager
      );
      await this.draupnir.client.sendEvent(
        this.draupnir.managementRoomID,
        "m.reaction",
        {
          "m.relates_to": {
            rel_type: "m.annotation",
            event_id: successEventId,
            key: `${action.emoji} ✅`,
          },
        }
      );
      if (onSuccessRemoveEventId) {
        await this.draupnir.client.redactEvent(
          this.draupnir.managementRoomID,
          onSuccessRemoveEventId,
          "Action complete"
        );
      }
      if (response) {
        await this.draupnir.client.sendMessage(this.draupnir.managementRoomID, {
          msgtype: "m.notice",
          formatted_body: response,
          format: "org.matrix.custom.html",
          body: htmlToText(response),
          "m.relationship": {
            rel_type: "m.reference",
            event_id: successEventId,
          },
        });
      }
    } catch (ex) {
      if (ex instanceof Error) {
        await this.draupnir.client.sendEvent(
          this.draupnir.managementRoomID,
          "m.reaction",
          {
            "m.relates_to": {
              rel_type: "m.annotation",
              event_id: failureEventId,
              key: `${action.emoji} ❌`,
            },
          }
        );
        await this.draupnir.client.sendEvent(
          this.draupnir.managementRoomID,
          "m.notice",
          {
            body: ex.message || "<unknown error>",
            "m.relationship": {
              rel_type: "m.reference",
              event_id: failureEventId,
            },
          }
        );
      } else {
        throw new TypeError(`Something is throwing absoloute garbage ${ex}`);
      }
    }
  }
}

/**
 * An abuse report received from a user.
 *
 * Note: These reports end up embedded in Matrix messages, behind key `ABUSE_REPORT_KEY`,
 * so we're using Matrix naming conventions rather than JS/TS naming conventions.
 */
export interface IReport {
  /**
   * The user who sent the abuse report.
   */
  readonly accused_id: string;

  /**
   * The user who sent the message reported as abuse.
   */
  readonly reporter_id: string;

  /**
   * The room in which `eventId` took place.
   */
  readonly room_id: string;
  readonly room_alias_or_id: string;

  /**
   * The event reported as abuse.
   */
  readonly event_id: string;
}

/**
 * An abuse report, extended with the information we need for a confirmation report.
 *
 * Note: These reports end up embedded in Matrix messages, behind key `ABUSE_ACTION_CONFIRMATION_KEY`,
 * so we're using Matrix naming conventions rather than JS/TS naming conventions.
 */
interface IReportWithAction extends IReport {
  /**
   * The label of the action we're confirming, e.g. `kick-user`.
   */
  readonly action: string;

  /**
   * The event in which we originally notified of the abuse.
   */
  readonly notification_event_id: string;
}

/**
 * A user action displayed in the UI as a Matrix reaction.
 */
interface IUIAction {
  /**
   * A unique label.
   *
   * Used by Mjölnir to differentiate the actions, e.g. `kick-user`.
   */
  readonly label: string;

  /**
   * A unique Emoji.
   *
   * Used to help users avoid making errors when clicking on a button.
   */
  readonly emoji: string;

  /**
   * If `true`, this is an action that needs confirmation. Otherwise, the
   * action may be executed immediately.
   */
  readonly needsConfirmation: boolean;

  /**
   * Detect whether the action may be executed, e.g. whether Mjölnir has
   * sufficient powerlevel to execute this action.
   *
   * **Security caveat** This assumes that the security policy on whether
   * the operation can be executed is:
   *
   * > *Anyone* in the moderation room and who isn't muted can execute
   * > an operation iff Mjölnir has the rights to execute it.
   *
   * @param report Details on the abuse report.
   */
  canExecute(
    manager: ReportManager,
    report: IReport,
    moderationroomID: string
  ): Promise<boolean>;

  /**
   * A human-readable title to display for the end-user.
   *
   * @param report Details on the abuse report.
   */
  title(manager: ReportManager, report: IReport): Promise<string>;

  /**
   * A human-readable help message to display for the end-user.
   *
   * @param report Details on the abuse report.
   */
  help(manager: ReportManager, report: IReport): Promise<string>;

  /**
   * Attempt to execute the action.
   */
  execute(
    manager: ReportManager,
    report: IReport,
    moderationroomID: string,
    displayManager: DisplayManager
  ): Promise<string | undefined>;
}

/**
 * UI action: Ignore bad report
 */
class IgnoreBadReport implements IUIAction {
  public label = "bad-report";
  public emoji = "🚯";
  public needsConfirmation = true;
  public async canExecute(
    _manager: ReportManager,
    _report: IReport
  ): Promise<boolean> {
    return true;
  }
  public async title(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Ignore";
  }
  public async help(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Ignore bad report";
  }
  public async execute(
    manager: ReportManager,
    report: IReportWithAction
  ): Promise<string | undefined> {
    await manager.draupnir.client.sendEvent(
      manager.draupnir.managementRoomID,
      "m.room.message",
      {
        msgtype: "m.notice",
        body: "Report classified as invalid",
        "m.new_content": {
          body: `Report by user ${report.reporter_id} has been classified as invalid`,
          msgtype: "m.text",
        },
        "m.relates_to": {
          rel_type: "m.replace",
          event_id: report.notification_event_id,
        },
      }
    );
    return;
  }
}

/**
 * UI action: Redact reported message.
 */
class RedactMessage implements IUIAction {
  public label = "redact-message";
  public emoji = "🗍";
  public needsConfirmation = true;
  public async canExecute(
    manager: ReportManager,
    report: IReport
  ): Promise<boolean> {
    try {
      return await manager.draupnir.client.userHasPowerLevelForAction(
        await manager.draupnir.client.getUserId(),
        report.room_id,
        PowerLevelAction.RedactEvents
      );
    } catch (ex) {
      return false;
    }
  }
  public async title(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Redact";
  }
  public async help(_manager: ReportManager, report: IReport): Promise<string> {
    return `Redact event ${report.event_id}`;
  }
  public async execute(
    manager: ReportManager,
    report: IReport,
    _moderationroomID: string
  ): Promise<string | undefined> {
    await manager.draupnir.client.redactEvent(report.room_id, report.event_id);
    return;
  }
}

/**
 * UI action: Kick accused user.
 */
class KickAccused implements IUIAction {
  public label = "kick-accused";
  public emoji = "⚽";
  public needsConfirmation = true;
  public async canExecute(
    manager: ReportManager,
    report: IReport
  ): Promise<boolean> {
    try {
      return await manager.draupnir.client.userHasPowerLevelForAction(
        await manager.draupnir.client.getUserId(),
        report.room_id,
        PowerLevelAction.Kick
      );
    } catch (ex) {
      return false;
    }
  }
  public async title(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Kick";
  }
  public async help(_manager: ReportManager, report: IReport): Promise<string> {
    return `Kick ${htmlEscape(report.accused_id)} from room ${htmlEscape(report.room_alias_or_id)}`;
  }
  public async execute(
    manager: ReportManager,
    report: IReport
  ): Promise<string | undefined> {
    await manager.draupnir.client.kickUser(report.accused_id, report.room_id);
    return;
  }
}

/**
 * UI action: Mute accused user.
 */
class MuteAccused implements IUIAction {
  public label = "mute-accused";
  public emoji = "🤐";
  public needsConfirmation = true;
  public async canExecute(
    manager: ReportManager,
    report: IReport
  ): Promise<boolean> {
    try {
      return await manager.draupnir.client.userHasPowerLevelFor(
        await manager.draupnir.client.getUserId(),
        report.room_id,
        "m.room.power_levels",
        true
      );
    } catch (ex) {
      return false;
    }
  }
  public async title(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Mute";
  }
  public async help(_manager: ReportManager, report: IReport): Promise<string> {
    return `Mute ${htmlEscape(report.accused_id)} in room ${htmlEscape(report.room_alias_or_id)}`;
  }
  public async execute(
    manager: ReportManager,
    report: IReport
  ): Promise<string | undefined> {
    await manager.draupnir.client.setUserPowerLevel(
      report.accused_id,
      report.room_id,
      -1
    );
    return;
  }
}

/**
 * UI action: Ban accused.
 */
class BanAccused implements IUIAction {
  public label = "ban-accused";
  public emoji = "🚫";
  public needsConfirmation = true;
  public async canExecute(
    manager: ReportManager,
    report: IReport
  ): Promise<boolean> {
    try {
      return await manager.draupnir.client.userHasPowerLevelForAction(
        await manager.draupnir.client.getUserId(),
        report.room_id,
        PowerLevelAction.Ban
      );
    } catch (ex) {
      return false;
    }
  }
  public async title(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Ban";
  }
  public async help(_manager: ReportManager, report: IReport): Promise<string> {
    return `Ban ${htmlEscape(report.accused_id)} from room ${htmlEscape(report.room_alias_or_id)}`;
  }
  public async execute(
    manager: ReportManager,
    report: IReport
  ): Promise<string | undefined> {
    await manager.draupnir.client.banUser(report.accused_id, report.room_id);
    return;
  }
}

/**
 * UI action: Help.
 */
class Help implements IUIAction {
  public label = "help";
  public emoji = "❓";
  public needsConfirmation = false;
  public async canExecute(
    _manager: ReportManager,
    _report: IReport
  ): Promise<boolean> {
    return true;
  }
  public async title(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Help";
  }
  public async help(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "This help";
  }
  public async execute(
    manager: ReportManager,
    report: IReport,
    moderationroomID: string
  ): Promise<string | undefined> {
    // Produce a html list of actions, in the order specified by ACTION_LIST.
    const list: string[] = [];
    for (const action of ACTION_LIST) {
      if (await action.canExecute(manager, report, moderationroomID)) {
        list.push(
          `<li>${action.emoji} ${await action.help(manager, report)}</li>`
        );
      }
    }
    if (
      !(await ACTIONS.get("ban-accused")?.canExecute(
        manager,
        report,
        moderationroomID
      ))
    ) {
      list.push(
        `<li>Some actions were disabled because Mjölnir is not moderator in room ${htmlEscape(report.room_alias_or_id)}</li>`
      );
    }
    const body = `<ul>${list.join("\n")}</ul>`;
    return body;
  }
}

/**
 * Escalate to the moderation room of this instance of Mjölnir.
 */
class EscalateToServerModerationRoom implements IUIAction {
  public label = "escalate-to-server-moderation";
  public emoji = "⏫";
  public needsConfirmation = true;
  public async canExecute(
    manager: ReportManager,
    report: IReport,
    moderationroomID: string
  ): Promise<boolean> {
    if (moderationroomID === manager.draupnir.managementRoomID) {
      // We're already at the top of the chain.
      return false;
    }
    try {
      await manager.draupnir.client.getEvent(report.room_id, report.event_id);
    } catch (ex) {
      // We can't fetch the event.
      return false;
    }
    return true;
  }
  public async title(
    _manager: ReportManager,
    _report: IReport
  ): Promise<string> {
    return "Escalate";
  }
  public async help(manager: ReportManager, _report: IReport): Promise<string> {
    return `Escalate report to ${getHomeserver(await manager.draupnir.client.getUserId())} server moderators`;
  }
  public async execute(
    manager: ReportManager,
    report: IReport,
    _moderationroomID: string,
    displayManager: DisplayManager
  ): Promise<string | undefined> {
    const event = await manager.draupnir.client.getEvent(
      report.room_id,
      report.event_id
    );

    // Display the report and UI directly in the management room, as if it had been
    // received from /report.
    //
    // Security:
    // - `kind`: statically known good;
    // - `moderationroomID`: statically known good;
    // - `reporterId`: we trust `report`, could be forged by a moderator, low impact;
    // - `event`: checked just before.
    await displayManager.displayReportAndUI({
      kind: Kind.ESCALATED_REPORT,
      reporterId: report.reporter_id,
      moderationroomID: manager.draupnir.managementRoomID,
      event,
    });
    return;
  }
}

class DisplayManager {
  constructor(private owner: ReportManager) {}

  /**
   * Display the report and any UI button.
   *
   *
   * # Security
   *
   * This method DOES NOT PERFORM ANY SECURITY CHECKS.
   *
   * @param kind The kind of report (server-wide abuse report / room moderation request). Low security.
   * @param event The offending event. The fact that it's the offending event MUST be checked. No assumptions are made on the content.
   * @param reporterId The user who reported the event. MUST be checked.
   * @param reason A user-provided comment. Low-security.
   * @param moderationroomID The room in which the report and ui will be displayed. MUST be checked.
   */
  public async displayReportAndUI(args: {
    kind: Kind;
    event: RoomEvent;
    reporterId: string;
    reason?: string;
    nature?: string;
    moderationroomID: string;
    error?: string;
  }) {
    const { kind, event, reporterId, reason, nature, moderationroomID, error } =
      args;

    const roomID = event["room_id"];
    const room = MatrixRoomReference.fromRoomID(roomID, [
      serverName(this.owner.draupnir.clientUserID),
    ]);
    const eventId = event["event_id"];
    const MAX_EVENT_CONTENT_LENGTH = 2048;
    const MAX_NEWLINES = 64;
    let eventContent: { msg: string } | { html: string } | { text: string };
    const unknownEvent = () => {
      return {
        text: this.limitLength(
          JSON.stringify(event["content"], null, 2),
          MAX_EVENT_CONTENT_LENGTH,
          MAX_NEWLINES
        ),
      };
    };
    try {
      if (event["type"] === "m.room.encrypted") {
        eventContent = { msg: "<encrypted content>" };
      } else if (Value.Check(RoomMessage, event)) {
        if (
          Value.Check(TextMessageContent, event.content) &&
          event.content.formatted_body !== undefined
        ) {
          eventContent = {
            html: this.limitLength(
              event.content.formatted_body,
              MAX_EVENT_CONTENT_LENGTH,
              MAX_NEWLINES
            ),
          };
        } else if (
          "body" in event.content &&
          typeof event.content.body === "string"
        ) {
          eventContent = {
            text: this.limitLength(
              event.content.body,
              MAX_EVENT_CONTENT_LENGTH,
              MAX_NEWLINES
            ),
          };
        } else {
          eventContent = unknownEvent();
        }
      } else {
        eventContent = unknownEvent();
      }
    } catch (ex) {
      eventContent = {
        msg: `<Cannot extract event. Please verify that Mjölnir has been invited to room ${room.toPermalink()} and made room moderator or administrator>.`,
      };
    }

    const accusedId = event["sender"];

    let reporterDisplayName: string, accusedDisplayName: string;
    try {
      reporterDisplayName =
        (await this.owner.draupnir.client.getUserProfile(reporterId))[
          "displayname"
        ] || reporterId;
    } catch (ex) {
      reporterDisplayName = "<Error: Cannot extract reporter display name>";
    }
    try {
      accusedDisplayName =
        (await this.owner.draupnir.client.getUserProfile(accusedId))[
          "displayname"
        ] || accusedId;
    } catch (ex) {
      accusedDisplayName = "<Error: Cannot extract accused display name>";
    }
    const eventShortcut = `https://matrix.to/#/${encodeURIComponent(roomID)}/${encodeURIComponent(eventId)}`;

    let eventTimestamp;
    try {
      eventTimestamp = new Date(event["origin_server_ts"]).toUTCString();
    } catch (ex) {
      eventTimestamp = `<Cannot extract event. Please verify that Mjölnir has been invited to room ${room.toPermalink()} and made room moderator or administrator>.`;
    }

    let title;
    switch (kind) {
      case Kind.MODERATION_REQUEST:
        title = "Moderation request";
        break;
      case Kind.SERVER_ABUSE_REPORT:
        title = "Abuse report";
        break;
      case Kind.ESCALATED_REPORT:
        title = "Moderation request escalated by moderators";
        break;
      case Kind.ERROR:
        title = "Error";
        break;
    }

    let readableNature = "unspecified";
    if (nature) {
      readableNature = NATURE_DESCRIPTIONS.get(nature) || readableNature;
    }

    // We need to send the report as html to be able to use spoiler markings.
    // We build this as dom to be absolutely certain that we're not introducing
    // any kind of injection within the report.

    // Please do NOT insert any `${}` in the following backticks, to avoid
    // any XSS attack.
    const document = new JSDOM(`
        <body>
        <div>
            <b><span id="title"></span></b>
        </div>
        <div>
            <b>Filed by</b> <span id='reporter-display-name'></span> (<code id='reporter-id'></code>)
        </div>
        <b>Against</b> <span id='accused-display-name'></span> (<code id='accused-id'></code>)
        <div>
            <b>Nature</b> <span id='nature-display'></span> (<code id='nature-source'></code>)
        </div>
        <div>
            <b>Room</b> <a id='room-shortcut'><span id='room-alias-or-id'></span></a>
        </div>
        <hr />
        <div id='details-or-error'>
        <details>
            <summary>Event details</summary>
            <div>
            <b>Event</b> <span id='event-id'></span> <a id='event-shortcut'>Go to event</a>
            </div>
            <div>
            <b>When</b> <span id='event-timestamp'></span>
            </div>
            <div>
            <b>Content</b> <span id='event-container'><code id='event-content'></code><span>
            </div>
        </details>
        </div>
        <hr />
        <details>
        <summary>Comments</summary>
        <b>Comments</b> <code id='reason-content'></code></div>
        </details>
        </body>`).window.document;

    // ...insert text content
    for (const [key, value] of [
      ["title", title],
      ["reporter-display-name", reporterDisplayName],
      ["reporter-id", reporterId],
      ["accused-display-name", accusedDisplayName],
      ["accused-id", accusedId],
      ["event-id", eventId],
      ["room-alias-or-id", roomID],
      ["reason-content", reason || "<no reason given>"],
      ["nature-display", readableNature],
      ["nature-source", nature || "<no nature provided>"],
      ["event-timestamp", eventTimestamp],
      ["details-or-error", kind === Kind.ERROR ? error : null],
    ]) {
      if (key !== null && key !== undefined) {
        const node = document.getElementById(key);
        if (node && value) {
          node.textContent = value;
        }
      }
    }
    // ...insert links
    for (const [key, value] of [
      ["event-shortcut", eventShortcut],
      ["room-shortcut", room.toPermalink()],
    ]) {
      if (key !== undefined) {
        const node = document.getElementById(key);
        if (node !== null && value !== undefined) {
          (node as HTMLAnchorElement).href = value;
        }
      }
    }

    // ...insert HTML content
    for (const { key, value } of [
      { key: "event-content", value: eventContent },
    ]) {
      const node = document.getElementById(key);
      if (node) {
        if ("msg" in value) {
          node.textContent = value.msg;
        } else if ("text" in value) {
          node.textContent = value.text;
        } else if ("html" in value) {
          node.innerHTML = value.html;
        }
      }
    }

    // ...set presentation
    if (!("msg" in eventContent)) {
      // If there's some event content, mark it as a spoiler.
      const eventContainer = document.getElementById("event-container");
      if (eventContainer !== null) {
        eventContainer.setAttribute("data-mx-spoiler", "");
      }
    }

    // Embed additional information in the notice, for use by the
    // action buttons.
    const report: IReport = {
      accused_id: accusedId,
      reporter_id: reporterId,
      event_id: eventId,
      room_id: roomID,
      room_alias_or_id: roomID,
    };
    const notice = {
      msgtype: "m.notice",
      body: htmlToText(document.body.outerHTML, { wordwrap: false }),
      format: "org.matrix.custom.html",
      formatted_body: document.body.outerHTML,
      [ABUSE_REPORT_KEY]: report,
    };

    const noticeEventId = await this.owner.draupnir.client.sendMessage(
      this.owner.draupnir.managementRoomID,
      notice
    );
    if (kind !== Kind.ERROR) {
      // Now let's display buttons.
      for (const [label, action] of ACTIONS) {
        // Display buttons for actions that can be executed.
        if (!(await action.canExecute(this.owner, report, moderationroomID))) {
          continue;
        }
        await this.owner.draupnir.client.sendEvent(
          this.owner.draupnir.managementRoomID,
          "m.reaction",
          {
            "m.relates_to": {
              rel_type: "m.annotation",
              event_id: noticeEventId,
              key: `${action.emoji} ${await action.title(this.owner, report)} [${label}]`,
            },
          }
        );
      }
    }
  }

  private limitLength(
    text: string,
    maxLength: number,
    maxNewlines: number
  ): string {
    const originalLength = text.length;
    // Shorten text if it is too long.
    if (text.length > maxLength) {
      text = text.substring(0, maxLength);
    }
    // Shorten text if there are too many newlines.
    // Note: This only looks for text newlines, not `<div>`, `<li>` or any other HTML box.
    let index = -1;
    let newLines = 0;
    while (true) {
      index = text.indexOf("\n", index);
      if (index === -1) {
        break;
      }
      index += 1;
      newLines += 1;
      if (newLines > maxNewlines) {
        text = text.substring(0, index);
        break;
      }
    }
    if (text.length < originalLength) {
      return `${text}... [total: ${originalLength} characters]`;
    } else {
      return text;
    }
  }
}

/**
 * The actions we may be able to undertake in reaction to a report.
 *
 * As a list, ordered for displayed when users click on "Help".
 */
const ACTION_LIST = [
  new KickAccused(),
  new RedactMessage(),
  new MuteAccused(),
  new BanAccused(),
  new EscalateToServerModerationRoom(),
  new IgnoreBadReport(),
  new Help(),
];
/**
 * The actions we may be able to undertake in reaction to a report.
 *
 * As a map of labels => actions.
 */
const ACTIONS = new Map(ACTION_LIST.map((action) => [action.label, action]));

function getHomeserver(userId: string): string {
  return new UserID(userId).domain;
}
