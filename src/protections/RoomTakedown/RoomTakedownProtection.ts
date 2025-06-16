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
  SHA256HashStore,
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
import { isError, Result, ResultError } from "@gnuxie/typescript-result";
import {
  RoomDiscovery,
  RoomDiscoveryListener,
  RoomExplorer,
} from "./RoomDiscovery";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  wrapInRoot,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";
import { Type } from "@sinclair/typebox";
import { EDStatic } from "matrix-protection-suite/dist/Interface/Static";
import { renderDiscoveredRoom } from "./RoomDiscoveryRenderer";
import { NotificationRoomCreator } from "../NotificationRoom/NotificationRoom";
import { MatrixGlob } from "matrix-bot-sdk";
import { SynapseHTTPAntispamRoomExplorer } from "./SynapseHTTPAntispamRoomExplorer";
import {
  SynapseRoomListRoomExplorer,
  SynapseRoomListScanner,
} from "./SynapseRoomListRoomExplorerer";
import { StandardDiscoveredRoomStore } from "./DiscoveredRoomStore";

// FIXME: I don't like that the exploreres are tied to this protection anymore!
// I think they should be distinct protections. AAAAAAAAAAAAAAAAAAAAAAAAaaa
// But imagine that we did want the discovery event emitter... how would that
// work with protections?
// I'll tell you. The consumer would have to name each protection it wants
// and find them and attach listeners. And then it'd also need an event
// to show when the source gets destroyed.

// hmm we can still do it if we just wack the RoomDiscovery implementation
// onto the draupnir class.

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
        description: "The room where notifications should be sent.",
      })
    ),
    discoveryNotificationEnabled: Type.Boolean({
      default: true,
      description:
        "Wether to send notifications for newly discovered rooms from the homerserver.",
    }),
    roomListScanIntervalMS: Type.Integer({
      default: 30 * 60_000,
      description:
        "How frequently to scan the entire list of rooms synapse is joined to. This is a huge operation",
    }),
    roomListScanCooldownMS: Type.Integer({
      default: 5 * 60_000,
      description:
        "The minimum amount of time the protection should wait between each scan of the room list. If you are using synapse-http-antispam this should be quite a long time.",
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

export type RoomTakedownProtectionDescription = ProtectionDescription<
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
    hashStore: SHA256HashStore,
    automaticallyRedactForReasons: MatrixGlob[],
    private readonly roomMessageSender: RoomMessageSender,
    private readonly discoveryNotificationEnabled: boolean,
    private readonly discoveryNotificationMembershipThreshold: number,
    public readonly discoveryNotificationRoom: StringRoomID,
    private readonly roomExplorers: RoomExplorer[],
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
    this.roomExplorers.forEach((explorer) => {
      explorer.unregisterListeners();
    });
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
  async factory(
    description,
    protectedRoomsSet,
    draupnir,
    capabilitySet,
    settings
  ): Promise<Result<RoomTakedownProtection>> {
    if (
      settings.discoveryNotificationEnabled &&
      settings.discoveryNotificationRoom === undefined
    ) {
      // FIXME: The type parameters are really fucked for the protection system
      // and that needs fixing. The problem is that the protection system was written
      // before we knew how to do this properly.
      return (await NotificationRoomCreator.createNotificationRoomFromDraupnir(
        draupnir,
        description as unknown as ProtectionDescription,
        settings,
        "discoveryNotificationRoom",
        "Room Discovery Notification",
        log
      )) as Result<RoomTakedownProtection>;
    }
    if (
      draupnir.stores.hashStore === undefined ||
      draupnir.stores.roomAuditLog === undefined
    ) {
      return ResultError.Result(
        "This protection requires a hash store and audit log to be available to draupnir, and they are not in your configuration."
      );
    }
    const roomDetailsProvider = draupnir.synapseAdminClient
      ? new SynapseAdminRoomDetailsProvider(draupnir.synapseAdminClient)
      : undefined;
    const roomDiscovery = roomDetailsProvider
      ? new StandardDiscoveredRoomStore(
          draupnir.stores.hashStore,
          roomDetailsProvider
        )
      : undefined;
    const synapseHTTPAntispamRoomExplorer =
      draupnir.synapseHTTPAntispam && roomDiscovery
        ? new SynapseHTTPAntispamRoomExplorer(
            draupnir.synapseHTTPAntispam,
            roomDiscovery
          )
        : undefined;
    const synapseRoomListRoomExplorer =
      draupnir.synapseAdminClient && roomDiscovery
        ? new SynapseRoomListRoomExplorer(
            settings.roomListScanCooldownMS,
            settings.roomListScanIntervalMS,
            new SynapseRoomListScanner(
              roomDiscovery,
              draupnir.synapseAdminClient
            )
          )
        : undefined;
    const roomExploreres: RoomExplorer[] = [];
    if (synapseHTTPAntispamRoomExplorer) {
      roomExploreres.push(synapseHTTPAntispamRoomExplorer);
    }
    if (synapseRoomListRoomExplorer) {
      roomExploreres.push(synapseRoomListRoomExplorer);
    }
    return Ok(
      new RoomTakedownProtection(
        description,
        capabilitySet,
        protectedRoomsSet,
        draupnir.stores.roomAuditLog,
        draupnir.stores.hashStore,
        draupnir.config.automaticallyRedactForReasons.map(
          (reason) => new MatrixGlob(reason)
        ),
        draupnir.clientPlatform.toRoomMessageSender(),
        settings.discoveryNotificationEnabled,
        settings.discoveryNotificationMembershipThreshold,
        settings.discoveryNotificationRoom ?? draupnir.managementRoomID,
        roomExploreres,
        roomDiscovery
      )
    );
  },
});
