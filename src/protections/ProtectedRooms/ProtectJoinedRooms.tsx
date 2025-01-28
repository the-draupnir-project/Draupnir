// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomReference,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ClientRooms,
  isError,
  Logger,
  MembershipChange,
  MembershipChangeType,
  ProtectedRoomsSet,
  RoomMessageSender,
  RoomSetResultBuilder,
  Task,
} from "matrix-protection-suite";
import { sendMatrixEventsFromDeadDocument } from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { renderRoomSetResult } from "../../capabilities/CommonRenderers";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";

const log = new Logger("ProtectAllJoinedRooms");

export class ProtectedJoinedRooms {
  public constructor(
    private readonly clientUserID: StringUserID,
    private readonly managementRoomID: StringRoomID,
    private readonly protectedRoomsSet: ProtectedRoomsSet,
    private readonly clientRooms: ClientRooms,
    private readonly roomMessageSender: RoomMessageSender
  ) {
    // nothing to do.
  }
  handleMembershipChange(changes: MembershipChange[]): void {
    for (const change of changes) {
      if (change.userID === this.clientUserID) {
        switch (change.membershipChangeType) {
          case MembershipChangeType.NoChange: {
            continue;
          }
          default: {
            void this.syncProtectedRooms();
            return;
          }
        }
      }
    }
  }

  public async syncProtectedRooms() {
    const policyRooms =
      this.protectedRoomsSet.issuerManager.allWatchedLists.map((profile) =>
        profile.room.toRoomIDOrAlias()
      );
    const roomsToProtect =
      this.clientRooms.currentRevision.allJoinedRooms.filter((roomID) => {
        return (
          !policyRooms.includes(roomID) &&
          !this.protectedRoomsSet.isProtectedRoom(roomID)
        );
      });
    const setResult = new RoomSetResultBuilder();
    for (const roomID of roomsToProtect) {
      const protectResult =
        await this.protectedRoomsSet.protectedRoomsManager.addRoom(
          MatrixRoomReference.fromRoomID(roomID)
        );
      if (isError(protectResult)) {
        log.error("Unable to protect the room", roomID, protectResult.error);
      }
      setResult.addResult(roomID, protectResult);
    }
    if (setResult.getResult().map.size === 0) {
      return;
    } else {
      void Task(
        sendMatrixEventsFromDeadDocument(
          this.roomMessageSender,
          this.managementRoomID,
          <root>
            {renderRoomSetResult(setResult.getResult(), {
              summary: <p>Protecting new rooms.</p>,
            })}
          </root>,
          {}
        ) as Promise<Result<void>>
      );
    }
  }
}
