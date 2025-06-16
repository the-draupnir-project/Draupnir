// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ConstantPeriodItemBatch,
  isError,
  Logger,
  PolicyRuleChange,
  StandardBatcher,
} from "matrix-protection-suite";
import { CheckEventForSpamRequestBody } from "../../webapis/SynapseHTTPAntispam/CheckEventForSpamEndpoint";
import { SynapseHttpAntispam } from "../../webapis/SynapseHTTPAntispam/SynapseHttpAntispam";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { UserMayInviteRequestBody } from "../../webapis/SynapseHTTPAntispam/UserMayInviteEndpoint";
import { UserMayJoinRoomRequestBody } from "../../webapis/SynapseHTTPAntispam/UserMayJoinRoomEndpoint";
import { RoomDiscovery, RoomExplorer } from "./RoomDiscovery";

const log = new Logger("SynapseHTTPAntispamRoomDiscovery");

export class SynapseHTTPAntispamRoomExplorer implements RoomExplorer {
  private readonly batcher: StandardBatcher<StringRoomID, void>;

  constructor(
    private readonly synapseHTTPAntispam: SynapseHttpAntispam,
    private readonly discoveredRoomStore: RoomDiscovery,
    private readonly batchWaitPeriodMS = 500
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
    this.batcher = new StandardBatcher(
      () =>
        new ConstantPeriodItemBatch<StringRoomID, void>(
          this.forwardDiscoveredBatch,
          { waitPeriodMS: this.batchWaitPeriodMS }
        )
    );
  }

  private readonly forwardDiscoveredBatch = async function (
    this: SynapseHTTPAntispamRoomExplorer,
    rawEntries: [StringRoomID, undefined][]
  ): Promise<void> {
    const discoveryResult = await this.discoveredRoomStore.checkRoomsDiscovered(
      rawEntries.map(([roomID]) => ({ roomID }))
    );
    if (isError(discoveryResult)) {
      log.error(
        "Unxpected error while trying to store undiscovered rooms",
        discoveryResult.error
      );
      return;
    }
  }.bind(this);

  private readonly handleCheckEventForSpam = function (
    this: SynapseHTTPAntispamRoomExplorer,
    { event }: CheckEventForSpamRequestBody
  ): void {
    if (!this.discoveredRoomStore.isRoomDiscovered(event.room_id)) {
      this.batcher.add(event.room_id);
    }
  }.bind(this);

  private readonly handleUserMayInvite = function (
    this: SynapseHTTPAntispamRoomExplorer,
    { room_id }: UserMayInviteRequestBody
  ): void {
    if (!this.discoveredRoomStore.isRoomDiscovered(room_id)) {
      this.batcher.add(room_id);
    }
  }.bind(this);

  private readonly handleUserMayJoin = function (
    this: SynapseHTTPAntispamRoomExplorer,
    { room }: UserMayJoinRoomRequestBody
  ): void {
    if (!this.discoveredRoomStore.isRoomDiscovered(room)) {
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

  public handlePolicyChange(_change: PolicyRuleChange[]): void {
    // nothing to do.
    // We don't need to refresh when rules are added or removed.
  }
}
