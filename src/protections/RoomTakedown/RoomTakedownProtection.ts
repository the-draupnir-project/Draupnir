// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractProtection,
  ActionResult,
  describeProtection,
  Logger,
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
import { ResultError } from "@gnuxie/typescript-result";
import {
  RoomDiscovery,
  SynapseHTTPAntispamRoomDiscovery,
} from "./RoomDiscovery";

const log = new Logger("RoomTakedownProtection");

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
    auditLog: RoomAuditLog,
    private readonly roomDiscovery: RoomDiscovery | undefined
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

  handleProtectionDisable(): void {
    this.roomDiscovery?.unregisterListeners();
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
    if (
      draupnir.stores.hashStore === undefined ||
      draupnir.stores.roomAuditLog === undefined
    ) {
      return ResultError.Result(
        "This protection requires a hash store and audit log to be available to draupnir, and they are not in your configuration."
      );
    }
    const roomDiscovery = (() => {
      if (draupnir.synapseHTTPAntispam !== undefined) {
        return new SynapseHTTPAntispamRoomDiscovery(
          draupnir.synapseHTTPAntispam,
          draupnir.stores.hashStore
        );
      } else {
        log.warn(
          "synapseHTTPAntispam is not configured for this draupnir, and will not be used for room discovery"
        );
        return undefined;
      }
    })();
    return Ok(
      new RoomTakedownProtection(
        description,
        capabilitySet,
        protectedRoomsSet,
        draupnir.stores.hashStore,
        draupnir.stores.roomAuditLog,
        roomDiscovery
      )
    );
  },
});
