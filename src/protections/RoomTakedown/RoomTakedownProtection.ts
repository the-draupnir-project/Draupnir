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
  RoomBasicDetails,
  RoomMessageSender,
  StringRoomIDSchema,
  Task,
} from "matrix-protection-suite";
import { RoomTakedownCapability } from "../../capabilities/RoomTakedownCapability";
import { Draupnir } from "../../Draupnir";
import { StandardRoomTakedown } from "./RoomTakedown";
import { RoomAuditLog } from "./RoomAuditLog";
import {
  SynapseAdminRoomDetailsProvider,
  SynapseAdminRoomTakedownCapability,
} from "../../capabilities/SynapseAdminRoomTakedown/SynapseAdminRoomTakedown";
import { isError, ResultError } from "@gnuxie/typescript-result";
import {
  RoomDiscovery,
  RoomDiscoveryListener,
  SynapseHTTPAntispamRoomDiscovery,
} from "./RoomDiscovery";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { sendMatrixEventsFromDeadDocument } from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { wrapInRoot } from "../../commands/interface-manager/MatrixHelpRenderer";
import { Type } from "@sinclair/typebox";
import { EDStatic } from "matrix-protection-suite/dist/Interface/Static";
import { renderDiscoveredRoom } from "./RoomDiscoveryRenderer";

const log = new Logger("RoomTakedownProtection");

const RoomTakedownProtectionSettings = Type.Object(
  {
    discoveryNotificationMembershipThreshold: Type.Integer({
      default: 20,
      description:
        "The number of members required in the room for it to appear in the notification. This is to prevent showing direct messages or small rooms that could be too much of an invasion of privacy. We don't have access to enough information to determine this a better way.",
    }),
    // There needs to be a transform for room references
    discoveryNotificationRoom: Type.Optional(
      Type.Union([StringRoomIDSchema, Type.Undefined()], {
        default: undefined,
        description:
          "The room where notifications should be sent. Currently broken and needs to be edited from a state event while we figure something out",
      })
    ),
    discoveryNotificationEnabled: Type.Boolean({
      default: true,
      description:
        "Wether to send notifications for newly discovered rooms from the homerserver.",
    }),
  },
  { title: "RoomTakedownProtectionSettings" }
);

type RoomTakedownProtectionSettings = EDStatic<
  typeof RoomTakedownProtectionSettings
>;

type RoomTakedownProtectionCapabilities = {
  roomTakedownCapability: RoomTakedownCapability;
};

type RoomTakedownProtectionDescription = ProtectionDescription<
  Draupnir,
  typeof RoomTakedownProtectionSettings,
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
    auditLog: RoomAuditLog,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly discoveryNotificationEnabled: boolean,
    private readonly discoveryNotificationMembershipThreshold: number,
    private readonly discoveryNotificationRoom: StringRoomID,
    private readonly roomDiscovery: RoomDiscovery | undefined
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.roomTakedown = new StandardRoomTakedown(
      auditLog,
      capabilities.roomTakedownCapability
    );
    void Task(
      this.roomTakedown.checkAllRooms(
        this.protectedRoomsSet.watchedPolicyRooms.currentRevision
      )
    );
    if (this.discoveryNotificationEnabled) {
      this.roomDiscovery?.on("RoomDiscovery", this.roomDiscoveryListener);
    }
  }

  private readonly roomDiscoveryListener: RoomDiscoveryListener = function (
    this: RoomTakedownProtection,
    details: RoomBasicDetails
  ) {
    if (
      (details.joined_members ?? 0) <
      this.discoveryNotificationMembershipThreshold
    ) {
      return;
    }
    void Task(
      (async () => {
        const sendResult = await sendMatrixEventsFromDeadDocument(
          this.roomMessageSender,
          this.discoveryNotificationRoom,
          wrapInRoot(renderDiscoveredRoom(details)),
          {}
        );
        if (isError(sendResult)) {
          log.error(
            "Error sending a notification about a discovered room",
            details.room_id,
            sendResult.error
          );
        }
      })()
    );
  }.bind(this);

  handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<ActionResult<void>> {
    return this.roomTakedown.handlePolicyChange(revision, changes);
  }

  handleProtectionDisable(): void {
    this.roomDiscovery?.unregisterListeners();
    this.roomDiscovery?.off("RoomDiscovery", this.roomDiscoveryListener);
  }
}

describeProtection<
  RoomTakedownProtectionCapabilities,
  Draupnir,
  typeof RoomTakedownProtectionSettings
>({
  name: RoomTakedownProtection.name,
  description: `A protection to shutdown rooms matching policies from watched lists`,
  capabilityInterfaces: {
    roomTakedownCapability: "RoomTakedownCapability",
  },
  defaultCapabilities: {
    roomTakedownCapability: SynapseAdminRoomTakedownCapability.name,
  },
  configSchema: RoomTakedownProtectionSettings,
  factory(description, protectedRoomsSet, draupnir, capabilitySet, settings) {
    if (
      draupnir.stores.hashStore === undefined ||
      draupnir.stores.roomAuditLog === undefined
    ) {
      return ResultError.Result(
        "This protection requires a hash store and audit log to be available to draupnir, and they are not in your configuration."
      );
    }
    const roomDiscovery = (() => {
      const roomDetailsProvider = draupnir.synapseAdminClient
        ? new SynapseAdminRoomDetailsProvider(draupnir.synapseAdminClient)
        : undefined;
      if (roomDetailsProvider === undefined) {
        log.warn(
          "This protection currently requires synapse admin capability in order to fetch room details"
        );
        return undefined;
      }
      if (draupnir.synapseHTTPAntispam !== undefined) {
        return new SynapseHTTPAntispamRoomDiscovery(
          draupnir.synapseHTTPAntispam,
          draupnir.stores.hashStore,
          roomDetailsProvider
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
        draupnir.stores.roomAuditLog,
        draupnir.clientPlatform.toRoomMessageSender(),
        settings.discoveryNotificationEnabled,
        settings.discoveryNotificationMembershipThreshold,
        settings.discoveryNotificationRoom ?? draupnir.managementRoomID,
        roomDiscovery
      )
    );
  },
});
