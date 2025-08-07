// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import {
  MatrixRoomID,
  MatrixRoomReference,
  StringRoomID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  renderDetailsNotice,
  renderElaborationTrail,
  renderExceptionTrail,
  renderOutcome,
  renderRoomPill,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";
import {
  Logger,
  ProtectedRoomsManager,
  RoomJoiner,
  RoomMessageSender,
  StateChange,
  StateChangeType,
  Task,
  TombstoneEvent,
  Value,
} from "matrix-protection-suite";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";

const log = new Logger("ProtectReplacementRooms");

export class ProtectReplacementRooms {
  public constructor(
    private readonly managementRoomID: StringRoomID,
    private readonly roomJoiner: RoomJoiner,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly protectedRoomsManager: ProtectedRoomsManager
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

  private async protectReplacementRoom(
    replacementRoom: MatrixRoomID
  ): Promise<Result<void>> {
    const joinResult = await this.roomJoiner.joinRoom(replacementRoom);
    if (isError(joinResult)) {
      return joinResult.elaborate(
        "Failed to join replacement room while following a room upgrade"
      );
    }
    const protectResult =
      await this.protectedRoomsManager.addRoom(replacementRoom);
    if (isError(protectResult)) {
      return protectResult.elaborate(
        "Failed to protect the replacement room while following a room upgrade"
      );
    }
    return Ok(undefined);
  }

  private async notifyManagementRoomOfUpgrade(
    event: TombstoneEvent,
    replacementRoom: MatrixRoomID
  ): Promise<Result<void>> {
    return (await sendMatrixEventsFromDeadDocument(
      this.roomMessageSender,
      this.managementRoomID,
      <root>
        <h4>
          The room{" "}
          {renderRoomPill(MatrixRoomReference.fromRoomID(event.room_id))} has
          been upgraded to {renderRoomPill(replacementRoom)} (
          <code>{replacementRoom.toRoomIDOrAlias()}</code>)
        </h4>
        The replacement room is now protected.
      </root>,
      {}
    )) as Result<void>;
  }

  private async reportRoomUpgradeError(
    error: ResultError,
    event: TombstoneEvent,
    replacementRoom: MatrixRoomID
  ): Promise<Result<void>> {
    return (await sendMatrixEventsFromDeadDocument(
      this.roomMessageSender,
      this.managementRoomID,
      <root>
        <details>
          <summary>
            Failed to protect the replacement room{" "}
            {renderRoomPill(replacementRoom)} (
            {replacementRoom.toRoomIDOrAlias()}) after upgrading from{" "}
            {renderRoomPill(MatrixRoomReference.fromRoomID(event.room_id))} -{" "}
            {renderOutcome(false)}
          </summary>
          {error.mostRelevantElaboration}
          {renderDetailsNotice(error)}
          {renderElaborationTrail(error)}
          {renderExceptionTrail(error)}
        </details>
      </root>,
      {}
    )) as Result<void>;
  }

  private async handleTombstone(event: TombstoneEvent): Promise<Result<void>> {
    if (!this.protectedRoomsManager.isProtectedRoom(event.room_id)) {
      return Ok(undefined);
    }
    if (event.content.replacement_room === undefined) {
      // No replacement room specified, nothing to do.
      return Ok(undefined);
    }
    const replacementRoom = new MatrixRoomID(event.content.replacement_room, [
      userServerName(event.sender),
    ]);
    const upgradeResult = await this.protectReplacementRoom(replacementRoom);
    if (isError(upgradeResult)) {
      void Task(
        this.reportRoomUpgradeError(
          upgradeResult.error,
          event,
          replacementRoom
        ),
        { log }
      );
    } else {
      void Task(this.notifyManagementRoomOfUpgrade(event, replacementRoom), {
        log,
      });
    }
    return upgradeResult;
  }
}
