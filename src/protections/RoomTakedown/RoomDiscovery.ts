// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ConstantPeriodItemBatch,
  isError,
  Logger,
  SHA256RoomHashStore,
  StandardBatcher,
} from "matrix-protection-suite";
import { CheckEventForSpamRequestBody } from "../../webapis/SynapseHTTPAntispam/CheckEventForSpamEndpoint";
import { SynapseHttpAntispam } from "../../webapis/SynapseHTTPAntispam/SynapseHttpAntispam";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { UserMayInviteRequestBody } from "../../webapis/SynapseHTTPAntispam/UserMayInviteEndpoint";
import { UserMayJoinRoomRequestBody } from "../../webapis/SynapseHTTPAntispam/UserMayJoinRoomEndpoint";

const log = new Logger("SynapseHTTPAntispamRoomDiscovery");

export interface RoomDiscovery {
  unregisterListeners(): void;
}

export class SynapseHTTPAntispamRoomDiscovery implements RoomDiscovery {
  private readonly discoveredRooms = new Set<StringRoomID>();
  private readonly batcher = new StandardBatcher(
    () =>
      new ConstantPeriodItemBatch<StringRoomID, void>(
        this.forwardDiscoveredBatch,
        { waitPeriodMS: 2500 }
      )
  );
  constructor(
    private readonly synapseHTTPAntispam: SynapseHttpAntispam,
    private readonly hashStore: SHA256RoomHashStore
  ) {
    synapseHTTPAntispam.checkEventForSpamHandles.registerNonBlockingHandle(
      this.handleCheckEventForSpam
    );
    synapseHTTPAntispam.userMayInviteHandles.registerNonBlockingHandle(
      this.handleUserMayInvite
    );
    synapseHTTPAntispam.userMayJoinRoomHandles.registerNonBlockingHandle(
      this.handleUserMayJoin
    );
  }

  private readonly forwardDiscoveredBatch = async function (
    this: SynapseHTTPAntispamRoomDiscovery,
    rawEntries: [StringRoomID][]
  ): Promise<void> {
    const entries = rawEntries.flat();
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
