// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AbstractProtection,
  describeProtection,
  MembershipChange,
  MembershipEvent,
  ProtectedRoomsSet,
  ProtectionDescription,
  RoomMembershipRevision,
  UnknownConfig,
} from "matrix-protection-suite";
import { DraupnirProtection } from "../Protection";
import { Draupnir } from "../../Draupnir";
import { Ok, Result } from "@gnuxie/typescript-result";
import { ProtectedJoinedRooms } from "./ProtectJoinedRooms";
import { UnprotectPartedRooms } from "./UnprotectPartedRooms";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";

export type RoomsSetBehaviourCapabailities = Record<string, never>;
export type RoomsSetBehaviourSettings = UnknownConfig;

export type RoomsSetBehaviourDescription = ProtectionDescription<
  Draupnir,
  RoomsSetBehaviourSettings,
  RoomsSetBehaviourCapabailities
>;

export class RoomsSetBehaviour
  extends AbstractProtection<RoomsSetBehaviourDescription>
  implements DraupnirProtection<RoomsSetBehaviourDescription>
{
  private readonly protectJoinedRooms = new ProtectedJoinedRooms(
    this.draupnir.clientUserID,
    this.draupnir.managementRoomID,
    this.protectedRoomsSet,
    this.draupnir.clientRooms,
    this.draupnir.clientPlatform.toRoomMessageSender()
  );
  private readonly unprotectedPartedRooms = new UnprotectPartedRooms(
    this.draupnir.clientUserID,
    this.draupnir.managementRoomID,
    this.protectedRoomsSet.protectedRoomsManager,
    this.draupnir.clientPlatform.toRoomMessageSender()
  );
  public constructor(
    description: RoomsSetBehaviourDescription,
    capabilities: RoomsSetBehaviourCapabailities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    if (this.draupnir.config.protectAllJoinedRooms) {
      void this.protectJoinedRooms.syncProtectedRooms();
    }
  }

  public handleMembershipChange(
    _revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<Result<void>> {
    if (this.draupnir.config.protectAllJoinedRooms) {
      this.protectJoinedRooms.handleMembershipChange(changes);
    }
    for (const change of changes) {
      this.unprotectedPartedRooms.handleMembershipChange(change);
    }
    return Promise.resolve(Ok(undefined));
  }

  public handleExternalMembership(
    roomID: StringRoomID,
    event: MembershipEvent
  ): void {
    if (this.draupnir.config.protectAllJoinedRooms) {
      this.protectJoinedRooms.handleExternalMembership(roomID, event);
    }
  }
}

describeProtection<RoomsSetBehaviourCapabailities, Draupnir>({
  name: RoomsSetBehaviour.name,
  description:
    "Unprotects parted rooms and update the list of protected rooms.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  factory(description, protectedRoomsSet, draupnir, capabilities, _settings) {
    return Ok(
      new RoomsSetBehaviour(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});
