// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  roomIDServerName,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  Logger,
  RoomBasicDetails,
  SHA256HashStore,
} from "matrix-protection-suite";
import { RoomDetailsProvider } from "../../capabilities/RoomTakedownCapability";
import { RoomDiscovery } from "./RoomDiscovery";
import EventEmitter from "events";

const log = new Logger("DiscoveredRoomStore");

export type RoomToCheck = {
  roomID: StringRoomID;
  details?: RoomBasicDetails | undefined;
};

/**
 * Currently the store is polluted because of https://github.com/element-hq/synapse/issues/18563
 * Because of the fallout of this bug, there will be room details polluted in the following way:
 *
 * 1. empty string for `server`.
 * 2. empty string for `creator`.
 *
 * To cleanup, we probably need to destroy the details table entirely
 * and create a table for the server responsible for creating the room derived
 * from the room_id.
 * Then later if we find a way of obtaining the creator, we can store that
 * instead.
 *
 * The reason why this didn't happen in the first place is because we thought
 * that the creator would always be available and we would always derive the
 * server from the creator.
 */
export class StandardDiscoveredRoomStore
  extends EventEmitter
  implements RoomDiscovery
{
  private readonly discoveredRooms = new Set<StringRoomID>();

  public constructor(
    private readonly hashStore: SHA256HashStore,
    private readonly roomDetailsProvider: RoomDetailsProvider
  ) {
    super();
  }

  private async addRoomDetails(
    discoveredRoomsRecords: RoomToCheck[]
  ): Promise<Result<RoomBasicDetails[]>> {
    const discoveredRooms: RoomBasicDetails[] = [];
    for (const { roomID, details: providedDetails } of discoveredRoomsRecords) {
      const detailsResult =
        providedDetails === undefined
          ? await this.roomDetailsProvider.getRoomDetails(roomID)
          : Ok(providedDetails);
      if (isError(detailsResult)) {
        log.error(
          "Error fetching details for a discovered room",
          roomID,
          detailsResult.error
        );
      }
      const details = isError(detailsResult)
        ? { room_id: roomID }
        : detailsResult.ok;
      discoveredRooms.push(details);
      if (details.creator === undefined) {
        continue; // no point persisting details that don't have a creator.
      }
      const storeResult = await this.hashStore.storeRoomIdentification({
        creator: details.creator,
        roomID: details.room_id,
        server: roomIDServerName(details.room_id),
      });
      if (isError(storeResult)) {
        log.error(
          "Error storing room details for a room",
          roomID,
          details,
          storeResult
        );
      }
    }
    return Ok(discoveredRooms);
  }

  public async checkRoomsDiscovered(
    roomsToCheck: RoomToCheck[]
  ): Promise<Result<RoomBasicDetails[]>> {
    const entries = roomsToCheck.map((entry) => entry.roomID);
    const storeResult = await this.hashStore.storeUndiscoveredRooms(entries);
    if (isError(storeResult)) {
      return storeResult.elaborate(
        "Unxpected error while trying to store undiscovered rooms"
      );
    }
    const detailsResult = await this.addRoomDetails(roomsToCheck);
    if (isError(detailsResult)) {
      return detailsResult.elaborate(
        "Unxpected error while trying to add room details"
      );
    }
    for (const details of detailsResult.ok) {
      this.discoveredRooms.add(details.room_id);
      this.emit("RoomDiscovered", details);
    }
    return detailsResult;
  }

  public isRoomDiscovered(roomID: StringRoomID): boolean {
    return this.discoveredRooms.has(roomID);
  }
}
