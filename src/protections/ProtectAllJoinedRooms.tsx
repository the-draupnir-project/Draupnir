// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AbstractProtection,
  describeProtection,
  Logger,
  MembershipChange,
  MembershipChangeType,
  ProtectedRoomsSet,
  ProtectionDescription,
  RoomMembershipRevision,
  RoomSetResultBuilder,
  Task,
  UnknownConfig,
} from "matrix-protection-suite";
import { DraupnirProtection } from "./Protection";
import { Draupnir } from "../Draupnir";
import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { MatrixRoomReference } from "@the-draupnir-project/matrix-basic-types";
import { sendMatrixEventsFromDeadDocument } from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { renderRoomSetResult } from "../capabilities/CommonRenderers";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";

const log = new Logger("ProtectAllJoinedRooms");

export type ProtectAllJoinedRoomsProtectionCapabailities = Record<
  string,
  never
>;
export type ProtectAllJoinedRoomsProtectionSettings = UnknownConfig;

export type ProtectAllJoinedRoomsProtectionDescription = ProtectionDescription<
  Draupnir,
  ProtectAllJoinedRoomsProtectionSettings,
  ProtectAllJoinedRoomsProtectionCapabailities
>;

export class ProtectAllJoinedRoomsProtection
  extends AbstractProtection<ProtectAllJoinedRoomsProtectionDescription>
  implements DraupnirProtection<ProtectAllJoinedRoomsProtectionDescription>
{
  public constructor(
    description: ProtectAllJoinedRoomsProtectionDescription,
    capabilities: ProtectAllJoinedRoomsProtectionCapabailities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
  }
  handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<Result<void>> {
    for (const change of changes) {
      if (change.userID === this.draupnir.clientUserID) {
        switch (change.membershipChangeType) {
          case MembershipChangeType.NoChange: {
            continue;
          }
          default: {
            void this.syncProtectedRooms();
            return Promise.resolve(Ok(undefined));
          }
        }
      }
    }
    return Promise.resolve(Ok(undefined));
  }

  // This only adds rooms, we need something else that automatically unprotected rooms that we have left.
  private async syncProtectedRooms() {
    const policyRooms =
      this.protectedRoomsSet.issuerManager.allWatchedLists.map((profile) =>
        profile.room.toRoomIDOrAlias()
      );
    const roomsToProtect = this.draupnir.clientRooms.allPreemptedRooms.filter(
      (roomID) => {
        return (
          !policyRooms.includes(roomID) &&
          this.protectedRoomsSet.isProtectedRoom(roomID)
        );
      }
    );
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
          this.draupnir.clientPlatform.toRoomMessageSender(),
          this.draupnir.managementRoomID,
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

describeProtection<ProtectAllJoinedRoomsProtectionCapabailities, Draupnir>({
  name: ProtectAllJoinedRoomsProtection.name,
  description: "Protects all joined rooms",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  factory(description, protectedRoomsSet, draupnir, capabilities, _settings) {
    return Ok(
      new ProtectAllJoinedRoomsProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});
