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
  Logger,
  MembershipEvent,
  Ok,
  ProtectedRoomsSet,
  RoomEvent,
  Task,
  Value,
  isError,
  PermalinkSchema,
} from "matrix-protection-suite";
import {
  renderActionResultToEvent,
  renderMentionPill,
  renderRoomPill,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";
import { StaticDecode, Type } from "@sinclair/typebox";
import { Draupnir } from "../../Draupnir";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";

const log = new Logger("ProtectRoomsOnInvite");

const PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER =
  "me.marewolf.draupnir.protect_rooms_on_invite";

// would be nice to be able to use presentation types here idk.
const ProtectRoomsOnInvitePromptContext = Type.Object({
  invited_room: PermalinkSchema,
});
// this rule is stupid.

type ProtectRoomsOnInvitePromptContext = StaticDecode<
  typeof ProtectRoomsOnInvitePromptContext
>;

export class ProtectroomsOnInvite {
  private readonly protectPromptListener = this.protectListener.bind(this);
  public constructor(
    private readonly draupnir: Draupnir,
    private readonly protectedRoomsSet: ProtectedRoomsSet
  ) {
    this.draupnir.reactionHandler.on(
      PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER,
      this.protectPromptListener
    );
  }

  handleProtectionDisable(): void {
    this.draupnir.reactionHandler.off(
      PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER,
      this.protectPromptListener
    );
  }

  public promptToProtect(
    candidateRoom: MatrixRoomID,
    invitation: MembershipEvent
  ): void {
    void Task(
      (async () => {
        const renderPromptProtect = (): DocumentNode => (
          <root>
            {renderMentionPill(invitation.sender, invitation.sender)} has
            invited me to &#32;
            {renderRoomPill(candidateRoom)}, would you like to protect this
            room?
          </root>
        );
        const reactionMap = new Map<string, string>(
          Object.entries({ OK: "OK", Cancel: "Cancel" })
        );
        const promptSendResult = await sendMatrixEventsFromDeadDocument(
          this.draupnir.clientPlatform.toRoomMessageSender(),
          this.draupnir.managementRoomID,
          renderPromptProtect(),
          {
            additionalContent: this.draupnir.reactionHandler.createAnnotation(
              PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER,
              reactionMap,
              {
                invited_room: candidateRoom.toPermalink(),
              }
            ),
          }
        );
        if (isError(promptSendResult)) {
          log.error(
            `Could not send the prompt to protect the room: ${candidateRoom.toPermalink()}`,
            promptSendResult.error
          );
          return;
        }
        const promptEventID = promptSendResult.ok.at(0);
        if (promptEventID === undefined) {
          throw new TypeError(
            `We should have an eventID for the event that we just sent...`
          );
        }
        await this.draupnir.reactionHandler.addReactionsToEvent(
          this.draupnir.managementRoomID,
          promptEventID,
          reactionMap
        );
        return Ok(undefined);
      })()
    );
  }

  private protectListener(
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
    const context = Value.Decode(ProtectRoomsOnInvitePromptContext, rawContext);
    if (isError(context)) {
      log.error(`Could not decode context from prompt event`, context.error);
      renderActionResultToEvent(
        this.draupnir.clientPlatform.toRoomMessageSender(),
        this.draupnir.clientPlatform.toRoomReactionSender(),
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
            `Could not resolve the room to protect from the MatrixRoomReference: ${context.ok.invited_room.toPermalink()}.`
          );
          renderActionResultToEvent(
            this.draupnir.clientPlatform.toRoomMessageSender(),
            this.draupnir.clientPlatform.toRoomReactionSender(),
            promptEvent,
            resolvedRoom
          );
          return;
        }
        const addResult =
          await this.protectedRoomsSet.protectedRoomsManager.addRoom(
            resolvedRoom.ok
          );
        if (isError(addResult)) {
          addResult.elaborate(
            `Could not protect the room: ${resolvedRoom.ok.toPermalink()}`
          );
          renderActionResultToEvent(
            this.draupnir.clientPlatform.toRoomMessageSender(),
            this.draupnir.clientPlatform.toRoomReactionSender(),
            promptEvent,
            addResult
          );
          return;
        }
        renderActionResultToEvent(
          this.draupnir.clientPlatform.toRoomMessageSender(),
          this.draupnir.clientPlatform.toRoomReactionSender(),
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
