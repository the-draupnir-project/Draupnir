// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ConstantPeriodItemBatch,
  isError,
  Logger,
  RoomBasicDetails,
  RoomHashRecord,
  SHA256HashStore,
  StandardBatcher,
  Task,
} from "matrix-protection-suite";
import { CheckEventForSpamRequestBody } from "../../webapis/SynapseHTTPAntispam/CheckEventForSpamEndpoint";
import { SynapseHttpAntispam } from "../../webapis/SynapseHTTPAntispam/SynapseHttpAntispam";
import {
  StringRoomID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { UserMayInviteRequestBody } from "../../webapis/SynapseHTTPAntispam/UserMayInviteEndpoint";
import { UserMayJoinRoomRequestBody } from "../../webapis/SynapseHTTPAntispam/UserMayJoinRoomEndpoint";
import { EventEmitter } from "stream";
import { RoomDetailsProvider } from "../../capabilities/RoomTakedownCapability";

// FIXME: This should really have its own "Room acknowledged" table in the audit log...
//        which only sends when a notification has been sent to the admin room.
//        This would allow for complete coverage...

const log = new Logger("SynapseHTTPAntispamRoomDiscovery");

export type RoomDiscoveryListener = (details: RoomBasicDetails) => void;

export interface RoomDiscovery {
  unregisterListeners(): void;
  on(event: "RoomDiscovery", listener: RoomDiscoveryListener): this;
  off(event: "RoomDiscovery", listener: RoomDiscoveryListener): this;
  emit(event: "RoomDiscovery", details: RoomBasicDetails): void;
}
export class SynapseHTTPAntispamRoomDiscovery
  extends EventEmitter
  implements RoomDiscovery
{
  private readonly discoveredRooms = new Set<StringRoomID>();
  private readonly batcher: StandardBatcher<StringRoomID, void>;

  constructor(
    private readonly synapseHTTPAntispam: SynapseHttpAntispam,
    private readonly hashStore: SHA256HashStore,
    private readonly roomDetailsProvider: RoomDetailsProvider,
    private readonly batchWaitPeriodMS = 500
  ) {
    super();
    synapseHTTPAntispam.checkEventForSpamHandles.registerNonBlockingHandle(
      this.handleCheckEventForSpam
    );
    synapseHTTPAntispam.userMayInviteHandles.registerNonBlockingHandle(
      this.handleUserMayInvite
    );
    synapseHTTPAntispam.userMayJoinRoomHandles.registerNonBlockingHandle(
      this.handleUserMayJoin
    );
    this.batcher = new StandardBatcher(
      () =>
        new ConstantPeriodItemBatch<StringRoomID, void>(
          this.forwardDiscoveredBatch,
          { waitPeriodMS: this.batchWaitPeriodMS }
        )
    );
  }

  private addRoomDetails(discoveredRooms: RoomHashRecord[]): void {
    void Task(
      (async () => {
        for (const { room_id: roomID } of discoveredRooms) {
          const detailsResult =
            await this.roomDetailsProvider.getRoomDetails(roomID);
          if (isError(detailsResult)) {
            log.error(
              "Error fetching details for a discovered room",
              roomID,
              detailsResult.error
            );
            continue;
          }
          this.emit("RoomDiscovery", detailsResult.ok);
          if (detailsResult.ok.creator == undefined) {
            log.error(
              "Creator is missing from room details, which isn't great",
              detailsResult.ok
            );
            return;
          }
          const storeResult = await this.hashStore.storeRoomIdentification({
            creator: detailsResult.ok.creator,
            roomID: detailsResult.ok.room_id,
            server: userServerName(detailsResult.ok.creator),
          });
          if (isError(storeResult)) {
            log.error(
              "Error storing room details for a room",
              roomID,
              detailsResult.ok
            );
          }
        }
      })()
    );
  }

  private readonly forwardDiscoveredBatch = async function (
    this: SynapseHTTPAntispamRoomDiscovery,
    rawEntries: [StringRoomID, undefined][]
  ): Promise<void> {
    const entries = rawEntries.flatMap((entry) => entry[0]);
    const storeResult = await this.hashStore.storeUndiscoveredRooms(entries);
    if (isError(storeResult)) {
      log.error(
        "Unxpected error while trying to store undiscovered rooms",
        storeResult.error
      );
      return;
    }
    for (const roomID of entries) {
      this.discoveredRooms.add(roomID);
    }
    this.addRoomDetails(storeResult.ok);
  }.bind(this);

  private readonly handleCheckEventForSpam = function (
    this: SynapseHTTPAntispamRoomDiscovery,
    { event }: CheckEventForSpamRequestBody
  ): void {
    if (event.type === "m.room.member") {
      if (!this.discoveredRooms.has(event.room_id)) {
        this.batcher.add(event.room_id);
      }
    }
  }.bind(this);

  private readonly handleUserMayInvite = function (
    this: SynapseHTTPAntispamRoomDiscovery,
    { room_id }: UserMayInviteRequestBody
  ): void {
    if (!this.discoveredRooms.has(room_id)) {
      this.batcher.add(room_id);
    }
  }.bind(this);

  private readonly handleUserMayJoin = function (
    this: SynapseHTTPAntispamRoomDiscovery,
    { room }: UserMayJoinRoomRequestBody
  ): void {
    if (!this.discoveredRooms.has(room)) {
      this.batcher.add(room);
    }
  }.bind(this);

  unregisterListeners(): void {
    this.synapseHTTPAntispam.checkEventForSpamHandles.unregisterHandle(
      this.handleCheckEventForSpam
    );
    this.synapseHTTPAntispam.userMayInviteHandles.unregisterHandle(
      this.handleUserMayInvite
    );
    this.synapseHTTPAntispam.userMayJoinRoomHandles.unregisterHandle(
      this.handleUserMayJoin
    );
  }
}
