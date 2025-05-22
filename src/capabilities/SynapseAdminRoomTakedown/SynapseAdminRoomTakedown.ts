// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  describeCapabilityProvider,
  Logger,
  RoomBasicDetails,
} from "matrix-protection-suite";
import {
  RoomDetailsProvider,
  RoomTakedownCapability,
} from "../RoomTakedownCapability";
import { SynapseAdminClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { Draupnir } from "../../Draupnir";
import "../RoomTakedownCapability"; // needed for the interface to load.
const log = new Logger("SynapseAdminRoomTakedownCapability");

export class SynapseAdminRoomDetailsProvider implements RoomDetailsProvider {
  public constructor(private readonly adminClient: SynapseAdminClient) {
    // nothing to do mare.
  }
  public async getRoomDetails(
    roomID: StringRoomID
  ): Promise<Result<RoomBasicDetails>> {
    const detailsResponse = await this.adminClient.getRoomDetails(roomID);
    if (isError(detailsResponse)) {
      return detailsResponse;
    } else {
      return Ok({
        name: detailsResponse.ok?.name ?? undefined,
        creator: detailsResponse.ok?.creator,
        avatar: detailsResponse.ok?.avatar ?? undefined,
        topic: detailsResponse.ok?.topic ?? undefined,
        joined_members: detailsResponse.ok?.joined_members ?? undefined,
        room_id: roomID,
      });
    }
  }
}

export class SynapseAdminRoomTakedownCapability
  implements RoomTakedownCapability
{
  public readonly requiredPermissions = [];
  public readonly requiredStatePermissions = [];
  public readonly requiredEventPermissions = [];
  private readonly roomDetailsProvider = new SynapseAdminRoomDetailsProvider(
    this.adminClient
  );
  public constructor(private readonly adminClient: SynapseAdminClient) {
    // nothing to do mare.
  }

  public async isRoomTakendown(roomID: StringRoomID): Promise<Result<boolean>> {
    const blockStatusResponse = await this.adminClient.getBlockStatus(roomID);
    if (isError(blockStatusResponse)) {
      return blockStatusResponse;
    } else {
      return Ok(blockStatusResponse.ok.block);
    }
  }

  public async takedownRoom(
    roomID: StringRoomID
  ): Promise<Result<RoomBasicDetails>> {
    const detailsResponse =
      await this.roomDetailsProvider.getRoomDetails(roomID);
    let details: RoomBasicDetails;
    if (isError(detailsResponse)) {
      log.warn(
        "Unable to fetch details for a room being requested to shutdown",
        detailsResponse.error
      );
      details = { room_id: roomID };
    } else {
      details = detailsResponse.ok;
    }
    log.debug("Taking down room", roomID);
    // we use delete V1 because clients do not pick up the user's own leave event
    // in V2 and i don't know why.
    // That is very important in the case of stuck invitations.
    const takedownResult = await this.adminClient.deleteRoom(roomID, {
      block: true,
      purge: true,
    });
    if (isError(takedownResult)) {
      return takedownResult;
    } else {
      return Ok(details);
    }
  }

  public async getRoomDetails(
    roomID: StringRoomID
  ): Promise<Result<RoomBasicDetails>> {
    return await this.roomDetailsProvider.getRoomDetails(roomID);
  }
}

describeCapabilityProvider<Draupnir>({
  name: SynapseAdminRoomTakedownCapability.name,
  interface: "RoomTakedownCapability",
  description: "Takes down rooms using the synapse admin API",
  factory(description, draupnir) {
    if (draupnir.synapseAdminClient === undefined) {
      throw new TypeError(
        "Synapse admin client is not available on this draupnir instance"
      );
    }
    return new SynapseAdminRoomTakedownCapability(draupnir.synapseAdminClient);
  },
});

export class SimulatedRoomTakedownCapability implements RoomTakedownCapability {
  public readonly requiredPermissions = [];
  public readonly requiredStatePermissions = [];
  public readonly requiredEventPermissions = [];
  private readonly roomDetailsProvider = new SynapseAdminRoomDetailsProvider(
    this.adminClient
  );
  isSimulated?: true;
  public constructor(private readonly adminClient: SynapseAdminClient) {
    // nothing to do mare.
  }

  public async isRoomTakendown(roomID: StringRoomID): Promise<Result<boolean>> {
    const blockStatusResponse = await this.adminClient.getBlockStatus(roomID);
    if (isError(blockStatusResponse)) {
      return blockStatusResponse;
    } else {
      return Ok(blockStatusResponse.ok.block);
    }
  }

  public async takedownRoom(
    roomID: StringRoomID
  ): Promise<Result<RoomBasicDetails>> {
    const detailsResponse =
      await this.roomDetailsProvider.getRoomDetails(roomID);
    let details: RoomBasicDetails;
    if (isError(detailsResponse)) {
      log.warn(
        "Unable to fetch details for a room being requested to shutdown",
        detailsResponse.error
      );
      details = { room_id: roomID };
    } else {
      details = detailsResponse.ok;
    }
    return Ok(details);
  }

  public async getRoomDetails(
    roomID: StringRoomID
  ): Promise<Result<RoomBasicDetails>> {
    return await this.roomDetailsProvider.getRoomDetails(roomID);
  }
}

describeCapabilityProvider<Draupnir>({
  name: "SimulatedRoomTakedownCapability",
  description: "Simulates the synapse admin room takedown capability",
  interface: "RoomTakedownCapability",
  factory(description, draupnir) {
    if (draupnir.synapseAdminClient === undefined) {
      throw new TypeError(
        "Synapse admin client is not available on this draupnir instance"
      );
    }
    return new SimulatedRoomTakedownCapability(draupnir.synapseAdminClient);
  },
});
