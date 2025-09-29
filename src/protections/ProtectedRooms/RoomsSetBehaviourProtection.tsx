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
  RoomStateRevision,
  StateChange,
  UnknownConfig,
} from "matrix-protection-suite";
import { DraupnirProtection } from "../Protection";
import { Draupnir } from "../../Draupnir";
import { Ok, Result } from "@gnuxie/typescript-result";
import { ProtectedJoinedRooms } from "./ProtectJoinedRooms";
import { UnprotectPartedRooms } from "./UnprotectPartedRooms";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { ProtectReplacementRooms } from "./ProtectReplacementRooms";
import { WatchReplacementPolicyRooms } from "./WatchReplacementPolicyRooms";

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
  private readonly protectReplacementRooms = new ProtectReplacementRooms(
    this.draupnir.managementRoomID,
    this.draupnir.clientPlatform.toRoomJoiner(),
    this.draupnir.clientPlatform.toRoomMessageSender(),
    this.protectedRoomsSet.protectedRoomsManager
  );
  private readonly watchReplacementPolicyRooms =
    new WatchReplacementPolicyRooms(
      this.draupnir.managementRoomID,
      this.draupnir.clientPlatform.toRoomJoiner(),
      this.draupnir.clientPlatform.toRoomMessageSender(),
      this.draupnir.clientPlatform.toRoomReactionSender(),
      this.draupnir.protectedRoomsSet.watchedPolicyRooms,
      this.draupnir.roomStateManager,
      this.draupnir.policyRoomManager,
      this.draupnir.reactionHandler
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

  public handleStateChange(
    _revision: RoomStateRevision,
    changes: StateChange[]
  ): Promise<Result<void>> {
    this.protectReplacementRooms.handleRoomStateChange(changes);
    this.watchReplacementPolicyRooms.handleRoomStateChange(changes);
    return Promise.resolve(Ok(undefined));
  }

  public handleProtectionDisable(): void {
    this.watchReplacementPolicyRooms.unregisterListeners();
  }
}

describeProtection<RoomsSetBehaviourCapabailities, Draupnir>({
  name: RoomsSetBehaviour.name,
  description:
    "Unprotects parted rooms and update the list of protected rooms.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  async factory(
    description,
    protectedRoomsSet,
    draupnir,
    capabilities,
    _settings
  ) {
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
