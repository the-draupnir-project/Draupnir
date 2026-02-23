// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomReference,
  StringRoomID,
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
import {
  renderMentionPill,
  renderRoomPill,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";

export class UnprotectPartedRooms {
  constructor(
    private readonly clientUserID: StringUserID,
    private readonly managementRoomID: StringRoomID,
    private readonly protectedRoomsManager: ProtectedRoomsManager,
    private readonly messageSender: RoomMessageSender
  ) {
    // nothing to do.
  }

  public async handlePartedRoom(change: MembershipChange): Promise<void> {
    const room = MatrixRoomReference.fromRoomID(change.roomID);
    const unprotectResult = await this.protectedRoomsManager.removeRoom(room);
    const removalDescription = (
      <fragment>
        Draupnir has been removed from {renderRoomPill(room)} by{" "}
        {renderMentionPill(change.sender, change.sender)}
        {change.content.reason ? (
          <fragment>
            {" "}
            for reason: <code>{change.content.reason}</code>
          </fragment>
        ) : (
          ""
        )}
        .
      </fragment>
    );
    if (isOk(unprotectResult)) {
      void Task(
        sendMatrixEventsFromDeadDocument(
          this.messageSender,
          this.managementRoomID,
          <root>{removalDescription} The room is now unprotected.</root>,
          {}
        ),
        {
          description:
            "Report recently unprotected rooms to the management room.",
        }
      );
    } else {
      void Task(
        sendMatrixEventsFromDeadDocument(
          this.messageSender,
          this.managementRoomID,
          <root>
            {removalDescription} Draupnir could not unprotect the room. Please
            use <code>!draupnir rooms remove {room.toRoomIDOrAlias()}</code> if
            the room is still marked as protected.
          </root>,
          {}
        ),
        {
          description:
            "Report recently unprotected rooms to the management room.",
        }
      );
    }
  }

  public handleMembershipChange(change: MembershipChange): void {
    if (change.userID === this.clientUserID) {
      if (!this.protectedRoomsManager.isProtectedRoom(change.roomID)) {
        return;
      }
      switch (change.membershipChangeType) {
        case MembershipChangeType.Banned:
        case MembershipChangeType.Kicked:
        case MembershipChangeType.Left:
          void this.handlePartedRoom(change);
      }
    }
  }
}
