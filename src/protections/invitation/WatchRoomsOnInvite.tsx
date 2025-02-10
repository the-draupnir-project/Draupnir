// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ALL_RULE_TYPES,
  Logger,
  MJOLNIR_SHORTCODE_EVENT_TYPE,
  MembershipEvent,
  Ok,
  PermalinkSchema,
  ProtectedRoomsSet,
  RoomEvent,
  RoomStateRevision,
  Task,
  Value,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../../Draupnir";
import {
  renderActionResultToEvent,
  renderMentionPill,
  renderRoomPill,
} from "../../commands/interface-manager/MatrixHelpRenderer";
import { StaticDecode, Type } from "@sinclair/typebox";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { sendMatrixEventsFromDeadDocument } from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";

const log = new Logger("WatchRoomsOnInvite");

const WATCH_LISTS_ON_INVITE_PROMPT_LISTENER =
  "me.marewolf.draupnir.watch_rooms_on_invite";

// would be nice to be able to use presentation types here idk.
const WatchRoomsOnInvitePromptContext = Type.Object({
  invited_room: PermalinkSchema,
});
// this rule is stupid.

type WatchRoomsOnInvitePromptContext = StaticDecode<
  typeof WatchRoomsOnInvitePromptContext
>;

function isRevisionContainingPolicies(revision: RoomStateRevision) {
  return revision.getStateEventsOfTypes(ALL_RULE_TYPES).length > 0;
}

function isRevisionContainingShortcode(revision: RoomStateRevision) {
  return revision.getStateEvent(MJOLNIR_SHORTCODE_EVENT_TYPE, "") !== undefined;
}

export function isRevisionLikelyPolicyRoom(revision: RoomStateRevision) {
  return (
    isRevisionContainingPolicies(revision) ||
    isRevisionContainingShortcode(revision)
  );
}

export class WatchRoomsOnInvite {
  private readonly watchPromptListener = this.watchListener.bind(this);
  public constructor(
    private readonly draupnir: Draupnir,
    private readonly protectedRoomsSet: ProtectedRoomsSet
  ) {
    this.draupnir.reactionHandler.on(
      WATCH_LISTS_ON_INVITE_PROMPT_LISTENER,
      this.watchPromptListener
    );
  }

  handleProtectionDisable(): void {
    this.draupnir.reactionHandler.off(
      WATCH_LISTS_ON_INVITE_PROMPT_LISTENER,
      this.watchPromptListener
    );
  }

  public promptIfPossiblePolicyRoom(
    candidateRoom: MatrixRoomID,
    invitation: MembershipEvent
  ): void {
    void Task(
      (async () => {
        const stateRevisionIssuer =
          await this.draupnir.roomStateManager.getRoomStateRevisionIssuer(
            candidateRoom
          );
        if (isError(stateRevisionIssuer)) {
          return stateRevisionIssuer.elaborate(
            `Unable to fetch the room state revision issuer to check if newly joined room was a policy room.`
          );
        }
        if (
          !isRevisionLikelyPolicyRoom(stateRevisionIssuer.ok.currentRevision)
        ) {
          return Ok(undefined);
        }
        const promptResult = await this.promptWatchPolicyRoom(
          candidateRoom,
          invitation
        );
        if (isError(promptResult)) {
          return promptResult.elaborate(
            `Unable to send prompt to ask if Draupnir should watch a policy room`
          );
        }
        return Ok(undefined);
      })()
    );
  }

  private async promptWatchPolicyRoom(
    candidateRoom: MatrixRoomID,
    invitation: MembershipEvent
  ) {
    const renderPromptWatch = (): DocumentNode => (
      <root>
        {renderMentionPill(invitation.sender, invitation.sender)} has invited me
        to a policy room &#32;
        {renderRoomPill(candidateRoom)}, would you like Draupnir to watch this
        room as a policy list?
      </root>
    );
    const reactionMap = new Map<string, string>(
      Object.entries({ OK: "OK", Cancel: "Cancel" })
    );
    const promptSendResult = await sendMatrixEventsFromDeadDocument(
      this.draupnir.clientPlatform.toRoomMessageSender(),
      this.draupnir.managementRoomID,
      renderPromptWatch(),
      {
        additionalContent: this.draupnir.reactionHandler.createAnnotation(
          WATCH_LISTS_ON_INVITE_PROMPT_LISTENER,
          reactionMap,
          {
            invited_room: candidateRoom.toPermalink(),
          }
        ),
      }
    );
    if (isError(promptSendResult)) {
      log.error(
        `Could not send the prompt to watch the policy room: ${candidateRoom.toPermalink()}`,
        promptSendResult.error
      );
      return promptSendResult.elaborate(
        "Could not send the prompt to watch the policy room"
      );
    }
    const promptEventID = promptSendResult.ok.at(0);
    if (promptEventID === undefined) {
      throw new TypeError(
        `We should have an eventID for the event that we just sent...`
      );
    }
    await this.draupnir.reactionHandler.addReactionsToEvent(
      this.draupnir.client,
      this.draupnir.managementRoomID,
      promptEventID,
      reactionMap
    );
    return Ok(undefined);
  }

  private watchListener(
    key: string,
    _item: unknown,
    rawContext: unknown,
    _reactionMap: Map<string, unknown>,
    promptEvent: RoomEvent
  ): void {
    if (key === "Cancel") {
      void Task(this.draupnir.reactionHandler.cancelPrompt(promptEvent));
      return;
    }
    if (key !== "OK") {
      return;
    }
    const context = Value.Decode(WatchRoomsOnInvitePromptContext, rawContext);
    if (isError(context)) {
      log.error(`Could not decode context from prompt event`, context.error);
      renderActionResultToEvent(
        this.draupnir.clientPlatform.toRoomMessageSender(),
        this.draupnir.client,
        promptEvent,
        context
      );
      return;
    }
    void Task(
      (async () => {
        const resolvedRoom = await this.draupnir.clientPlatform
          .toRoomResolver()
          .resolveRoom(context.ok.invited_room);
        if (isError(resolvedRoom)) {
          resolvedRoom.elaborate(
            `Could not resolve the policy room to watch from the MatrixRoomReference: ${context.ok.invited_room.toPermalink()}.`
          );
          renderActionResultToEvent(
            this.draupnir.clientPlatform.toRoomMessageSender(),
            this.draupnir.client,
            promptEvent,
            resolvedRoom
          );
          return;
        }
        const addResult =
          await this.protectedRoomsSet.watchedPolicyRooms.watchPolicyRoomDirectly(
            resolvedRoom.ok
          );
        if (isError(addResult)) {
          addResult.elaborate(
            `Could not watch the policy room: ${resolvedRoom.ok.toPermalink()}`
          );
          renderActionResultToEvent(
            this.draupnir.clientPlatform.toRoomMessageSender(),
            this.draupnir.client,
            promptEvent,
            addResult
          );
          return;
        }
        renderActionResultToEvent(
          this.draupnir.clientPlatform.toRoomMessageSender(),
          this.draupnir.client,
          promptEvent,
          addResult
        );
        void Task(
          this.draupnir.reactionHandler.completePrompt(
            promptEvent.room_id,
            promptEvent.event_id
          )
        );
      })()
    );
  }
}
