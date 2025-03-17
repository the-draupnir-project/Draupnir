// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { Logger, RoomBasicDetails } from "matrix-protection-suite";
import {
  RoomDetailsProvider,
  RoomTakedownCapability,
} from "../RoomTakedownCapability";
import { SynapseAdminClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { isError, Ok, Result } from "@gnuxie/typescript-result";

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
}
