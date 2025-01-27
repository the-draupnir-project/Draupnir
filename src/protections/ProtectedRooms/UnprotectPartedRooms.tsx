// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomReference,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  isOk,
  MembershipChange,
  MembershipChangeType,
  ProtectedRoomsManager,
  RoomMessageSender,
  Task,
} from "matrix-protection-suite";
import { sendMatrixEventsFromDeadDocument } from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { renderRoomPill } from "../../commands/interface-manager/MatrixHelpRenderer";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";

export class UnprotectPartedRooms {
  constructor(
    private readonly clientUserID: StringUserID,
    private readonly protectedRoomsManager: ProtectedRoomsManager,
    private readonly messageSender: RoomMessageSender
  ) {
    // nothing to do.
  }

  public async handlePartedRoom(change: MembershipChange): Promise<void> {
    const room = MatrixRoomReference.fromRoomID(change.roomID);
    const unprotectResult = await this.protectedRoomsManager.removeRoom(room);
    if (isOk(unprotectResult)) {
      void Task(
        sendMatrixEventsFromDeadDocument(
          this.messageSender,
          room.toRoomIDOrAlias(),
          <root>
            Draupnir has been removed from {renderRoomPill(room)} and the room
            is now unprotected.
          </root>,
          {}
        ) as Promise<Result<void>>
      );
    } else {
      void Task(
        sendMatrixEventsFromDeadDocument(
          this.messageSender,
          room.toRoomIDOrAlias(),
          <root>
            Draupnir has been removed from {renderRoomPill(room)} but we could
            not unprotect the room. Please use{" "}
            <code>!draupnir rooms remove {room.toRoomIDOrAlias()}</code> if the
            room is still marked as protected.
          </root>,
          {}
        ) as Promise<Result<void>>
      );
    }
  }

  public handleMembershipChange(change: MembershipChange): void {
    if (change.userID === this.clientUserID) {
      switch (change.membershipChangeType) {
        case MembershipChangeType.Banned:
        case MembershipChangeType.Kicked:
        case MembershipChangeType.Left:
      }
    }
  }
}
