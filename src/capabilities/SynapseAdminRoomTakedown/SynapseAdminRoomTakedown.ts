// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { Logger } from "matrix-protection-suite";
import {
  RoomTakedownCapability,
  RoomTakedownDetails,
} from "../RoomTakedownCapability";
import { SynapseAdminClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { isError, Ok, Result } from "@gnuxie/typescript-result";

const log = new Logger("SynapseAdminRoomTakedownCapability");

export class SynapseAdminRoomTakedownCapability
  implements RoomTakedownCapability
{
  public readonly requiredPermissions = [];
  public readonly requiredStatePermissions = [];
  public readonly requiredEventPermissions = [];
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
  ): Promise<Result<RoomTakedownDetails>> {
    const detailsResponse = await this.adminClient.getRoomDetails(roomID);
    let details: RoomTakedownDetails;
    if (isError(detailsResponse)) {
      log.warn(
        "Unable to fetch details for a room being requested to shutdown",
        detailsResponse.error
      );
      details = { room_id: roomID };
    } else {
      details = {
        name: detailsResponse.ok?.name ?? undefined,
        creator: detailsResponse.ok?.creator,
        avatar: detailsResponse.ok?.avatar ?? undefined,
        topic: detailsResponse.ok?.topic ?? undefined,
        room_id: roomID,
      };
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
