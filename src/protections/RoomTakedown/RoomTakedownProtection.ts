// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractProtection,
  ActionResult,
  describeProtection,
  Ok,
  PolicyListRevision,
  PolicyRuleChange,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  SHA256RoomHashStore,
  Task,
  UnknownConfig,
} from "matrix-protection-suite";
import { RoomTakedownCapability } from "../../capabilities/RoomTakedownCapability";
import { Draupnir } from "../../Draupnir";
import { StandardRoomTakedown } from "./RoomTakedown";
import { RoomAuditLog } from "./RoomAuditLog";
import { SynapseAdminRoomTakedownCapability } from "../../capabilities/SynapseAdminRoomTakedown/SynapseAdminRoomTakedown";

// FIXME: We still haven't figured out how to poll for new rooms via the
// Synapse admin API.

// FIXME: We need to add the stores to draupnir somehow.
// probably from the toplevel.

type RoomTakedownProtectionCapabilities = {
  roomTakedownCapability: RoomTakedownCapability;
};

type RoomTakedownProtectionDescription = ProtectionDescription<
  Draupnir,
  UnknownConfig,
  RoomTakedownProtectionCapabilities
>;

export class RoomTakedownProtection
  extends AbstractProtection<RoomTakedownProtectionDescription>
  implements Protection<RoomTakedownProtectionDescription>
{
  private readonly roomTakedown: StandardRoomTakedown;
  constructor(
    description: RoomTakedownProtectionDescription,
    capabilities: RoomTakedownProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    hashStore: SHA256RoomHashStore,
    auditLog: RoomAuditLog
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.roomTakedown = new StandardRoomTakedown(
      hashStore,
      auditLog,
      capabilities.roomTakedownCapability
    );
    void Task(
      this.roomTakedown.checkAllRooms(
        this.protectedRoomsSet.watchedPolicyRooms.currentRevision
      )
    );
  }

  handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<ActionResult<void>> {
    return this.roomTakedown.handlePolicyChange(revision, changes);
  }
}

describeProtection<RoomTakedownProtectionCapabilities, Draupnir>({
  name: RoomTakedownProtection.name,
  description: `A protection to shutdown rooms matching policies from watched lists`,
  capabilityInterfaces: {
    roomTakedownCapability: "RoomTakedownCapability",
  },
  defaultCapabilities: {
    roomTakedownCapability: SynapseAdminRoomTakedownCapability.name,
  },
  factory(description, protectedRoomsSet, draupnir, capabilitySet, _settings) {
    return Ok(
      new RoomTakedownProtection(
        description,
        capabilitySet,
        protectedRoomsSet,
        draupnir.hashStore,
        draupnir.auditLog
      )
    );
  },
});
