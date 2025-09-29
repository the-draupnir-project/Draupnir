// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DocumentNode } from "@the-draupnir-project/interface-manager";
import {
  Logger,
  PolicyRoomManager,
  RoomEvent,
  RoomJoiner,
  RoomMessageSender,
  StateChange,
  StateChangeType,
  Task,
  TombstoneEvent,
  Value,
  WatchedPolicyRoom,
  WatchedPolicyRooms,
} from "matrix-protection-suite";
import { renderPolicyList } from "../../commands/StatusCommand";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomID,
  StringEventID,
  StringRoomID,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { isError, isOk, Ok, Result } from "@gnuxie/typescript-result";
import {
  MatrixReactionHandler,
  renderActionResultToEvent,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";
import { RoomReactionSender } from "matrix-protection-suite/dist/Client/RoomReactionSender";

const log = new Logger("WatchReplacementPolicyRooms");

const WatchReplacementPolicyRoomsPromptListenerName =
  "space.draupnir.watch_replacement_policy_rooms";

const WatchReplacementPolicyRoomsPromptReactionMap = {
  "Watch replacement only": "Watch replacement only",
  "Watch both": "Watch both",
  Cancel: "Cancel",
};

type WatchPolicyRoomPromptContext = {
  readonly replacement_room_id: StringRoomID;
  readonly original_room_id: StringRoomID;
  readonly tombstoneSender: StringUserID;
};

function renderReplacementPrompt(
  policyRoom: WatchedPolicyRoom,
  replacementRoom: WatchedPolicyRoom
): DocumentNode {
  return (
    <root>
      <h4>Policy room replaced</h4>
      The following policy room has been replaced, would you like Draupnir to
      watch the new policy room?
      <h5>Old room</h5>
      <ul>{renderPolicyList(policyRoom)}</ul>
      <h5>Replacement room</h5>
      <ul>{renderPolicyList(replacementRoom)}</ul>
      <h4>Prompt</h4>
      Unfortunately we are unable to determine the policy list curator's intent
      with this upgrade, and whether or not they want you to still watch the old
      room.
    </root>
  );
}

async function sendPromptForReplacementRoom(
  roomMessageSender: RoomMessageSender,
  managementRoomID: StringRoomID,
  tombstoneSender: StringUserID,
  reactionHandler: MatrixReactionHandler,
  oldRoomWatchProfile: WatchedPolicyRoom,
  replacementRoomWatchProfile: WatchedPolicyRoom
) {
  const reactionMap = new Map(
    Object.entries(WatchReplacementPolicyRoomsPromptReactionMap)
  );
  const sendResult = await sendMatrixEventsFromDeadDocument(
    roomMessageSender,
    managementRoomID,
    renderReplacementPrompt(oldRoomWatchProfile, replacementRoomWatchProfile),
    {
      additionalContent: reactionHandler.createAnnotation(
        WatchReplacementPolicyRoomsPromptListenerName,
        reactionMap,
        {
          tombstoneSender,
          original_room_id: oldRoomWatchProfile.room.toRoomIDOrAlias(),
          replacement_room_id:
            replacementRoomWatchProfile.room.toRoomIDOrAlias(),
        } satisfies WatchPolicyRoomPromptContext
      ),
    }
  );
  if (isError(sendResult)) {
    return sendResult;
  }
  return await reactionHandler.addReactionsToEvent(
    managementRoomID,
    sendResult.ok[0] as StringEventID,
    reactionMap
  );
}

/**
 * This class sends prompts to the management room to watch upgraded policy rooms.
 *
 * Lifecycle: unregisterListeners must be called to dispose.
 */
export class WatchReplacementPolicyRooms {
  private readonly watchReplacementPolicyRoomsPromptListener =
    this.handlePromptReaction.bind(this);
  public constructor(
    private readonly managementRoomID: StringRoomID,
    private readonly roomJoiner: RoomJoiner,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly roomReactionSender: RoomReactionSender,
    private readonly watchedPolicyRooms: WatchedPolicyRooms,
    private readonly policyRoomManager: PolicyRoomManager,
    private readonly reactionHandler: MatrixReactionHandler
  ) {
    this.reactionHandler.addListener(
      WatchReplacementPolicyRoomsPromptListenerName,
      this.watchReplacementPolicyRoomsPromptListener
    );
  }

  handleRoomStateChange(changes: StateChange[]): void {
    for (const change of changes) {
      if (change.eventType !== "m.room.tombstone") {
        continue;
      }
      switch (change.changeType) {
        case StateChangeType.Introduced:
        case StateChangeType.PartiallyRedacted:
        case StateChangeType.Reintroduced:
        case StateChangeType.SupersededContent:
          break;
        default:
          continue;
      }
      if (Value.Check(TombstoneEvent, change.state)) {
        void Task(this.handleTombstone(change.state), {
          log,
        });
      }
    }
  }

  private async handleTombstone(event: TombstoneEvent): Promise<Result<void>> {
    const findWatchProfile = (roomID: StringRoomID) =>
      this.watchedPolicyRooms.allRooms.find(
        (profile) => profile.room.toRoomIDOrAlias() === roomID
      );
    const oldRoomWatchProfile = findWatchProfile(event.room_id);
    if (
      !oldRoomWatchProfile ||
      event.content.replacement_room === undefined ||
      // Make sure that we aren't already watching the replacement room.
      findWatchProfile(event.content.replacement_room)
    ) {
      return Ok(undefined);
    }
    const replacementRoom = new MatrixRoomID(event.content.replacement_room, [
      userServerName(event.sender),
    ]);
    const joinAttempt = await this.roomJoiner.joinRoom(replacementRoom);
    if (isError(joinAttempt)) {
      // TODO: Report this to the management room.
      return Ok(undefined);
    }
    const policyRoomRevisionIssuer =
      await this.policyRoomManager.getPolicyRoomRevisionIssuer(replacementRoom);
    if (isError(policyRoomRevisionIssuer)) {
      // FIXME: This needs to be reported to the management room still.
      return policyRoomRevisionIssuer.elaborate(
        "Unable to fetch a policy room revision for an upgraded policy room"
      );
    }
    const replacementRoomWatchProfile = {
      room: replacementRoom,
      propagation: oldRoomWatchProfile.propagation,
      revision: policyRoomRevisionIssuer.ok.currentRevision,
    } satisfies WatchedPolicyRoom;
    // shouldn't this be a prompt to watch the new room?
    // Yes. it shouldn't happen automatically because it could be a hostile
    // takeover or something.
    const sendResult = await sendPromptForReplacementRoom(
      this.roomMessageSender,
      this.managementRoomID,
      event.sender,
      this.reactionHandler,
      oldRoomWatchProfile,
      replacementRoomWatchProfile
    );
    if (isError(sendResult)) {
      return sendResult.elaborate(
        "Unable to send prompt to the management room"
      );
    }
    return Ok(undefined);
  }

  public async handlePromptReaction(
    key: string,
    item: unknown,
    context: WatchPolicyRoomPromptContext,
    _reactionMap: Map<string, unknown>,
    promptEvent: RoomEvent
  ): Promise<void> {
    const renderResultToPromptEvent = (result: Result<void>) => {
      renderActionResultToEvent(
        this.roomMessageSender,
        this.roomReactionSender,
        promptEvent,
        result
      );
      if (isOk(result)) {
        void Task(
          this.reactionHandler.completePrompt(
            promptEvent.room_id,
            promptEvent.event_id
          )
        );
      }
    };
    if (key === WatchReplacementPolicyRoomsPromptReactionMap.Cancel) {
      void Task(this.reactionHandler.cancelPrompt(promptEvent));
      return;
    }
    if (key === WatchReplacementPolicyRoomsPromptReactionMap["Watch both"]) {
      const watchReplacementPolicyRoomResult =
        await this.watchedPolicyRooms.watchPolicyRoomDirectly(
          new MatrixRoomID(context.replacement_room_id, [
            userServerName(context.tombstoneSender),
          ])
        );
      renderResultToPromptEvent(watchReplacementPolicyRoomResult);
      return;
    }
    if (
      key ===
      WatchReplacementPolicyRoomsPromptReactionMap["Watch replacement only"]
    ) {
      const watchReplacementPolicyRoomResult =
        await this.watchedPolicyRooms.watchPolicyRoomDirectly(
          new MatrixRoomID(context.replacement_room_id, [
            userServerName(context.tombstoneSender),
          ])
        );
      if (isError(watchReplacementPolicyRoomResult)) {
        renderResultToPromptEvent(watchReplacementPolicyRoomResult);
        return;
      }
      const unwatchOriginalPolicyRoomResult =
        await this.watchedPolicyRooms.unwatchPolicyRoom(
          new MatrixRoomID(context.original_room_id, [
            userServerName(context.tombstoneSender),
          ])
        );
      renderResultToPromptEvent(unwatchOriginalPolicyRoomResult);
      return;
    }
    log.error(
      "Could not handle the prompt to upgrade the room",
      context.original_room_id
    );
  }

  public unregisterListeners(): void {
    this.reactionHandler.removeListener(
      WatchReplacementPolicyRoomsPromptListenerName,
      this.watchReplacementPolicyRoomsPromptListener
    );
  }
}
