// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import EventEmitter from "events";
import { RoomDiscovery, RoomExplorer } from "./RoomDiscovery";
import {
  ConstantPeriodBatch,
  GatedBackgroundTask,
  Logger,
  PolicyRuleChange,
  PolicyRuleChangeType,
  StandardTimedGate,
} from "matrix-protection-suite";
import { SynapseAdminClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { isError, Result } from "@gnuxie/typescript-result";
import { RoomListResponse } from "matrix-protection-suite-for-matrix-bot-sdk/dist/SynapseAdmin/RoomListEndpoint";

const log = new Logger("SynapseRoomListExplorer");

// The way this should work is by having a gate.
// each time the gate is called it will run a scan
// unless the last gate was 1 minute ago
// then in the background we call the same gate every
// 15 minutes or so or when the protection is created.
export class SynapseRoomListRoomExplorer
  extends EventEmitter
  implements RoomExplorer
{
  private readonly gate = new StandardTimedGate(
    this.scanRoomDirectory.bind(this),
    this.cooldownMS
  );
  private backgroundScan: ConstantPeriodBatch;

  private createScanLoop(): ConstantPeriodBatch {
    return new ConstantPeriodBatch(() => {
      this.gate.enqueueOpen();
      this.backgroundScan = this.createScanLoop();
    }, this.scanIntervalMS);
  }

  public constructor(
    private readonly cooldownMS: number,
    private readonly scanIntervalMS: number,
    private readonly scanner: SynapseRoomListScanner
  ) {
    super();
    this.gate.enqueueOpen();
    this.backgroundScan = this.createScanLoop();
  }

  public unregisterListeners(): void {
    this.gate.destroy();
    this.backgroundScan.cancel();
  }

  public handlePolicyChange(change: PolicyRuleChange[]): void {
    // we check for all rule types because they could be server and user
    // rules that we want to discover rooms for.
    // We also check for all match types because they might have just gotten
    // an invitation from a given sender and we haven't discovered that room yet.
    if (
      change.some(
        (c) =>
          c.changeType === PolicyRuleChangeType.Added ||
          c.changeType === PolicyRuleChangeType.Modified
      )
    ) {
      this.gate.enqueueOpen();
    }
  }

  private async scanRoomDirectory(
    taskTracker: GatedBackgroundTask
  ): Promise<void> {
    await this.scanner.scanRoomDirectory(taskTracker);
  }
}

export class SynapseRoomListScanner {
  public constructor(
    private readonly roomDiscovery: RoomDiscovery,
    private readonly synapseAdminClient: SynapseAdminClient
  ) {
    // nothing to do.
  }

  private async dealWithPage(page: RoomListResponse): Promise<Result<void>> {
    return (await this.roomDiscovery.checkRoomsDiscovered(
      page.rooms
        .filter((room) => !this.roomDiscovery.isRoomDiscovered(room.room_id))
        .map((room) => ({
          roomID: room.room_id,
          details: {
            room_id: room.room_id,
            creator: room.creator,
            name: room.name ?? undefined,
          },
        }))
    )) as Result<void>;
  }

  public async scanRoomDirectory(
    taskTracker: GatedBackgroundTask
  ): Promise<void> {
    let nextToken: undefined | number = undefined;
    let totalRooms = 0;
    log.info("Starting to scan the synapse room directory");
    do {
      const roomPageResult = await this.synapseAdminClient.listRooms({
        limit: 250,
        ...(nextToken ? { from: nextToken } : {}),
      });
      if (isError(roomPageResult)) {
        log.error(
          "Couldn't paginate the synapse room list",
          roomPageResult.error
        );
        return;
      }
      const pageProcessResult = await this.dealWithPage(roomPageResult.ok);
      if (isError(pageProcessResult)) {
        log.error(
          "Couldn't process the synapse room list page",
          pageProcessResult.error
        );
        return;
      }
      nextToken = roomPageResult.ok.next_batch ?? undefined;
      totalRooms = roomPageResult.ok.total_rooms ?? 0;
    } while (nextToken !== undefined && !taskTracker.isCancelled());
    log.info("Ended scan, number of rooms processed:", totalRooms);
  }
}
