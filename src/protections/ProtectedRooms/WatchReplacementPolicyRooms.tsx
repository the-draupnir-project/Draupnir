// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DocumentNode } from "@the-draupnir-project/interface-manager";
import {
  Logger,
  PolicyRoomManager,
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
  StringRoomID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  MatrixReactionHandler,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";

// TODO: Implement the listener and the methods to watch the rooms
// with the various options with regards to the MSC.

const log = new Logger("WatchReplacementPolicyRooms");

const WatchReplacementPolicyRoomsPromptListenerName =
  "space.draupnir.watch_replacement_policy_rooms";

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
      {renderPolicyList(policyRoom)}
      <h5>Replacement room</h5>
      {renderPolicyList(replacementRoom)}. Unfortunatley we are unable to
      determine the policy list curator's intent with this upgrade, and whether
      or not they want you to still watch the old room.
    </root>
  );
}

async function sendPromptForReplacementRoom(
  roomMessageSender: RoomMessageSender,
  managementRoomID: StringRoomID,
  reactionHandler: MatrixReactionHandler,
  oldRoomWatchProfile: WatchedPolicyRoom,
  replacementRoomWatchProfile: WatchedPolicyRoom
) {
  return await sendMatrixEventsFromDeadDocument(
    roomMessageSender,
    managementRoomID,
    renderReplacementPrompt(oldRoomWatchProfile, replacementRoomWatchProfile),
    {
      additionalContent: reactionHandler.createAnnotation(
        WatchReplacementPolicyRoomsPromptListenerName,
        new Map(
          Object.entries({
            "Watch replacement only": "Watch replacement only",
            "Watch both": "Watch both",
            Cancel: "Cancel",
          })
        )
      ),
    }
  );
}

export class WatchReplacementPolicyRooms {
  public constructor(
    private readonly managementRoomID: StringRoomID,
    private readonly roomJoiner: RoomJoiner,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly watchedPolicyRooms: WatchedPolicyRooms,
    private readonly policyRoomManager: PolicyRoomManager,
    private readonly reactionHandler: MatrixReactionHandler
  ) {
    // nothing to do.
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
      // FIXME: This needs to be reported to the managemnt room still.
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
}
