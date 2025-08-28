// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionResult,
  Client,
  ClientPlatform,
  ClientRooms,
  EventReport,
  LoggableConfigTracker,
  Logger,
  Membership,
  MembershipEvent,
  Ok,
  PolicyRoomManager,
  ProtectedRoomsSet,
  RoomEvent,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  RoomStateManager,
  Task,
  Value,
  isError,
} from "matrix-protection-suite";
import { UnlistedUserRedactionQueue } from "./queues/UnlistedUserRedactionQueue";
import { ThrottlingQueue } from "./queues/ThrottlingQueue";
import ManagementRoomOutput from "./managementroom/ManagementRoomOutput";
import { ReportPoller } from "./report/ReportPoller";
import { StandardReportManager } from "./report/ReportManager";
import {
  MatrixSendClient,
  SynapseAdminClient,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import { IConfig } from "./config";
import { LogLevel } from "matrix-bot-sdk";
import { RendererMessageCollector } from "./capabilities/RendererMessageCollector";
import { DraupnirRendererMessageCollector } from "./capabilities/DraupnirRendererMessageCollector";
import { renderProtectionFailedToStart } from "./protections/ProtectedRoomsSetRenderers";
import { draupnirStatusInfo, renderStatusInfo } from "./commands/StatusCommand";
import {
  StringRoomID,
  StringUserID,
  MatrixRoomID,
  isStringRoomID,
  isStringRoomAlias,
  MatrixRoomReference,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  makeDraupnirCommandDispatcher,
  makeDraupnirJSCommandDispatcher,
} from "./commands/DraupnirCommandDispatcher";
import { SafeModeToggle } from "./safemode/SafeModeToggle";
import { makeCommandDispatcherTimelineListener } from "./safemode/ManagementRoom";
import {
  BasicInvocationInformation,
  JSInterfaceCommandDispatcher,
  Presentation,
  StandardPresentationArgumentStream,
} from "@the-draupnir-project/interface-manager";
import { ManagementRoomDetail } from "./managementroom/ManagementRoomDetail";
import { SynapseHttpAntispam } from "./webapis/SynapseHTTPAntispam/SynapseHttpAntispam";
import { DraupnirStores } from "./backingstore/DraupnirStores";
import { HomeserverUserPurgingDeactivate } from "./protections/HomeserverUserPolicyApplication/HomeserverUserPurgingDeactivate";
import {
  ARGUMENT_PROMPT_LISTENER,
  COMMAND_CONFIRMATION_LISTENER,
  DEFAUILT_ARGUMENT_PROMPT_LISTENER,
  makeConfirmationPromptListener,
  makeListenerForArgumentPrompt,
  makeListenerForPromptDefault,
  MatrixAdaptorContext,
  MatrixReactionHandler,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";

const log = new Logger("Draupnir");

// webAPIS should not be included on the Draupnir class.
// That should be managed elsewhere.
// It's not actually relevant to the Draupnir instance and it only was connected
// to Draupnir because it needs to be started after Draupnir started and not before.
// And giving it to the class was a dumb easy way of doing that.

export class Draupnir implements Client, MatrixAdaptorContext {
  /**
   * This is for users who are not listed on a watchlist,
   * but have been flagged by the automatic spam detection as suispicous
   */
  public unlistedUserRedactionQueue = new UnlistedUserRedactionQueue();

  private readonly commandDispatcher = makeDraupnirCommandDispatcher(this);
  public taskQueue: ThrottlingQueue;
  /**
   * Reporting back to the management room.
   */
  public readonly managementRoomOutput: ManagementRoomOutput;
  /*
   * Config-enabled polling of reports in Synapse, so Draupnir can react to reports
   */
  private reportPoller?: ReportPoller;
  /**
   * Handle user reports from the homeserver.
   * FIXME: ReportManager should be a protection.
   */
  public readonly reportManager: StandardReportManager;

  public readonly reactionHandler: MatrixReactionHandler;

  public readonly purgingDeactivate =
    this.synapseAdminClient && this.stores.userRestrictionAuditLog
      ? new HomeserverUserPurgingDeactivate(
          this.synapseAdminClient,
          this.stores.userRestrictionAuditLog
        )
      : undefined;

  private readonly timelineEventListener = this.handleTimelineEvent.bind(this);

  public readonly capabilityMessageRenderer: RendererMessageCollector;

  private readonly commandDispatcherTimelineListener =
    makeCommandDispatcherTimelineListener(
      this.managementRoom,
      this.client,
      this.commandDispatcher
    );

  private readonly JSInterfaceDispatcher: JSInterfaceCommandDispatcher<BasicInvocationInformation> =
    makeDraupnirJSCommandDispatcher(this);
  private constructor(
    public readonly client: MatrixSendClient,
    public readonly clientUserID: StringUserID,
    public clientDisplayName: string,
    public readonly clientPlatform: ClientPlatform,
    public readonly managementRoomDetail: ManagementRoomDetail,
    public readonly clientRooms: ClientRooms,
    public readonly config: IConfig,
    public readonly protectedRoomsSet: ProtectedRoomsSet,
    public readonly roomStateManager: RoomStateManager,
    public readonly policyRoomManager: PolicyRoomManager,
    public readonly roomMembershipManager: RoomMembershipManager,
    public readonly loggableConfigTracker: LoggableConfigTracker,
    /** Draupnir has a feature where you can choose to accept invitations from a space and not just the management room. */
    public readonly acceptInvitesFromRoom: MatrixRoomID,
    public readonly acceptInvitesFromRoomIssuer: RoomMembershipRevisionIssuer,
    public readonly safeModeToggle: SafeModeToggle,
    public readonly stores: DraupnirStores,
    public readonly synapseAdminClient: SynapseAdminClient | undefined,
    public readonly synapseHTTPAntispam: SynapseHttpAntispam | undefined
  ) {
    this.managementRoomOutput = new ManagementRoomOutput(
      this.managementRoomDetail,
      this.clientUserID,
      this.client,
      this.config
    );
    this.taskQueue = new ThrottlingQueue(
      this.managementRoomOutput,
      config.backgroundDelayMS
    );
    this.reactionHandler = new MatrixReactionHandler(
      this.managementRoom.toRoomIDOrAlias(),
      clientUserID,
      clientPlatform
    );
    this.reportManager = new StandardReportManager(this);
    if (config.pollReports) {
      this.reportPoller = new ReportPoller(this, this.reportManager);
    }
    this.reactionHandler.on(
      ARGUMENT_PROMPT_LISTENER,
      makeListenerForArgumentPrompt(
        this.commandRoomID,
        this.commandDispatcher,
        this.reactionHandler
      )
    );
    this.reactionHandler.on(
      DEFAUILT_ARGUMENT_PROMPT_LISTENER,
      makeListenerForPromptDefault(
        this.commandRoomID,
        this.commandDispatcher,
        this.reactionHandler
      )
    );
    this.reactionHandler.on(
      COMMAND_CONFIRMATION_LISTENER,
      makeConfirmationPromptListener(
        this.commandRoomID,
        this.commandDispatcher,
        this.reactionHandler
      )
    );
    this.capabilityMessageRenderer = new DraupnirRendererMessageCollector(
      this.clientPlatform.toRoomMessageSender(),
      this.managementRoomID
    );
  }

  public static async makeDraupnirBot(
    client: MatrixSendClient,
    clientUserID: StringUserID,
    clientDisplayName: string,
    clientPlatform: ClientPlatform,
    managementRoomDetail: ManagementRoomDetail,
    clientRooms: ClientRooms,
    protectedRoomsSet: ProtectedRoomsSet,
    roomStateManager: RoomStateManager,
    policyRoomManager: PolicyRoomManager,
    roomMembershipManager: RoomMembershipManager,
    config: IConfig,
    loggableConfigTracker: LoggableConfigTracker,
    safeModeToggle: SafeModeToggle,
    stores: DraupnirStores,
    synapseHTTPAntispam: SynapseHttpAntispam | undefined
  ): Promise<ActionResult<Draupnir>> {
    const acceptInvitesFromRoom = await (async () => {
      if (config.autojoinOnlyIfManager) {
        return Ok(managementRoomDetail.managementRoom);
      } else {
        if (config.acceptInvitesFromSpace === undefined) {
          throw new TypeError(
            `You cannot leave config.acceptInvitesFromSpace undefined if you have disabled config.autojoinOnlyIfManager`
          );
        }
        const room = (() => {
          if (
            isStringRoomID(config.acceptInvitesFromSpace) ||
            isStringRoomAlias(config.acceptInvitesFromSpace)
          ) {
            return config.acceptInvitesFromSpace;
          } else {
            const parseResult = MatrixRoomReference.fromPermalink(
              config.acceptInvitesFromSpace
            );
            if (isError(parseResult)) {
              throw new TypeError(
                `config.acceptInvitesFromSpace: ${config.acceptInvitesFromSpace} needs to be a room id, alias or permalink`
              );
            }
            return parseResult.ok;
          }
        })();
        return await clientPlatform.toRoomJoiner().joinRoom(room);
      }
    })();
    if (isError(acceptInvitesFromRoom)) {
      return acceptInvitesFromRoom.elaborate(
        "Unable to join the space from config.acceptInvitesFromSpace"
      );
    }
    const acceptInvitesFromRoomIssuer =
      await roomMembershipManager.getRoomMembershipRevisionIssuer(
        acceptInvitesFromRoom.ok
      );
    if (isError(acceptInvitesFromRoomIssuer)) {
      return acceptInvitesFromRoomIssuer;
    }
    const draupnir = new Draupnir(
      client,
      clientUserID,
      clientDisplayName,
      clientPlatform,
      managementRoomDetail,
      clientRooms,
      config,
      protectedRoomsSet,
      roomStateManager,
      policyRoomManager,
      roomMembershipManager,
      loggableConfigTracker,
      acceptInvitesFromRoom.ok,
      acceptInvitesFromRoomIssuer.ok,
      safeModeToggle,
      stores,
      new SynapseAdminClient(client, clientUserID),
      synapseHTTPAntispam
    );
    const loadResult = await protectedRoomsSet.protections.loadProtections(
      protectedRoomsSet,
      draupnir,
      (error, protectionName, description) =>
        renderProtectionFailedToStart(
          clientPlatform.toRoomMessageSender(),
          managementRoomDetail.managementRoomID,
          error,
          protectionName,
          description
        )
    );
    if (isError(loadResult)) {
      return loadResult;
    }
    // we need to make sure that we are protecting the management room so we
    // have immediate access to its membership (for accepting invitations).
    const managementRoomProtectResult =
      await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
        managementRoomDetail.managementRoom
      );
    if (isError(managementRoomProtectResult)) {
      return managementRoomProtectResult;
    }
    return Ok(draupnir);
  }

  public get managementRoomID(): StringRoomID {
    return this.managementRoomDetail.managementRoomID;
  }

  public get managementRoom(): MatrixRoomID {
    return this.managementRoomDetail.managementRoom;
  }

  /**
   * Note: This is only public due to having to first start the syncloop before sending events
   * when we use encryption.
   * This means this is only used in the index.ts.
   */
  public async startupComplete(): Promise<void> {
    try {
      await this.managementRoomOutput.logMessage(
        LogLevel.INFO,
        "Draupnir@startup",
        "Startup complete. Now monitoring rooms."
      );
      const statusInfo = draupnirStatusInfo(this);
      await sendMatrixEventsFromDeadDocument(
        this.clientPlatform.toRoomMessageSender(),
        this.managementRoomID,
        renderStatusInfo(statusInfo),
        {}
      );
    } catch (ex) {
      log.error(`Caught an error when trying to show status at startup`, ex);
    }
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    if (
      Value.Check(MembershipEvent, event) &&
      event.state_key === this.clientUserID &&
      // if the membership is join, make sure that we filter out protected rooms.
      (event.content.membership === Membership.Join
        ? !this.protectedRoomsSet.isProtectedRoom(roomID)
        : true)
    ) {
      this.protectedRoomsSet.handleExternalMembership(roomID, event);
    }
    this.managementRoomMessageListener(roomID, event);
    void Task(
      (async () => {
        await this.reactionHandler.handleEvent(roomID, event);
      })()
    );
    if (this.protectedRoomsSet.isProtectedRoom(roomID)) {
      this.protectedRoomsSet.handleTimelineEvent(roomID, event);
    }
  }

  private managementRoomMessageListener(
    roomID: StringRoomID,
    event: RoomEvent
  ): void {
    if (roomID !== this.managementRoomID) {
      return;
    }
    this.commandDispatcherTimelineListener(roomID, event);
    this.reportManager.handleTimelineEvent(roomID, event);
  }

  /**
   * Start responding to events.
   * This will not start the appservice from listening and responding
   * to events. Nor will it start any syncing client.
   */
  public start(): void {
    // to avoid handlers getting out of sync on clientRooms and leaking
    // when draupnir keeps being started and restarted, we can basically
    // clear all listeners each time and add the factory listener back.
    this.clientRooms.on("timeline", this.timelineEventListener);
    if (this.reportPoller) {
      // allow this to crash draupnir if it fails, since we need to know.
      void this.reportPoller.startFromStoredSetting(
        this.client,
        this.managementRoomOutput
      );
    }

    // Open a new closure. We're not concerned too much if this fails.
    void (async () => {
      // Set some command structures we'll use in our MSC4333 event.
      // TODO: Populate all commands available, using the registered commands rather than hardcoding.
      await this.client.sendStateEvent(this.managementRoomID, "org.matrix.msc4332.commands", await this.client.getUserId(), {
        "sigil": "!",
        "commands": [
          {
            "syntax": "draupnir ban {userId} {reason}",
            "variables": {
              "userId": {
                "m.text": [{"body": "The user ID to ban"}],
              },
              "reason": {
                "m.text": [{"body": "The reason for the ban"}],
              },
            },
          },
          {
            "syntax": "draupnir kick {userId} {roomId} {reason}",
            "variables": {
              "userId": {
                "m.text": [{"body": "The user ID to kick"}],
              },
              "roomId": {
                "m.text": [{"body": "The room ID to kick the user from"}],
              },
              "reason": {
                "m.text": [{"body": "The reason for the kick"}],
              },
            },
          },
          {
            "syntax": "draupnir redact {permalink}",
            "variables": {
              "permalink": {
                "m.text": [{"body": "The event ID link to redact"}],
              },
            },
          },
          {
            "syntax": "draupnir redact {userId}",
            "variables": {
              "userId": {
                "m.text": [{"body": "The user ID to redact"}],
              },
            },
          },
        ]
      });

      // Now set that MSC4333 event.
      // TODO: Update when the protected room set changes.
      await this.client.sendStateEvent(this.managementRoomID, "org.matrix.msc4333.moderation_config", await this.client.getUserId(), {
        "protected_room_ids": this.protectedRoomsSet.allProtectedRooms.map(r => r.toRoomIDOrAlias()),
        "commands": {
          "ban": {
            "use": "draupnir ban {userId} {reason}",
            "prefill_variables": {},
          },
          "kick": {
            "use": "draupnir kick {userId} {roomId} {reason}",
            "prefill_variables": {},
          },
          "redact_event": {
            "use": "draupnir redact {permalink}",
            "prefill_variables": {},
          },
          "redact_user": {
            "use": "draupnir redact {userId}",
            "prefill_variables": {},
          },
        },
      });
    })();
  }

  public stop(): void {
    this.clientRooms.off("timeline", this.timelineEventListener);
    this.reportPoller?.stop();
    this.protectedRoomsSet.unregisterListeners();
    this.stores.dispose();
  }

  public createRoomReference(roomID: StringRoomID): MatrixRoomID {
    return new MatrixRoomID(roomID, [userServerName(this.clientUserID)]);
  }
  public handleEventReport(report: EventReport): void {
    this.protectedRoomsSet.handleEventReport(report);
  }

  /**
   * This is needed to implement the MatrixInterfaceAdaptor interface.
   */
  public get commandRoomID() {
    return this.managementRoomID;
  }

  /**
   * API for integration tests to be able to test commands, mostly to ensure
   * functionality of the appservice bots.
   */
  public async sendPresentationCommand<CommandReturn>(
    sender: StringUserID,
    ...items: Presentation[]
  ): Promise<ActionResult<CommandReturn>> {
    return await this.JSInterfaceDispatcher.invokeCommandFromPresentationStream(
      { commandSender: sender },
      new StandardPresentationArgumentStream(items)
    );
  }

  public async sendTextCommand<CommandReturn>(
    sender: StringUserID,
    command: string
  ): Promise<ActionResult<CommandReturn>> {
    return await this.JSInterfaceDispatcher.invokeCommandFromBody(
      { commandSender: sender },
      command
    );
  }
}
