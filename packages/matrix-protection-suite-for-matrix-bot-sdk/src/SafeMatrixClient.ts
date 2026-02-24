// SPDX-FileCopyrightText: 2023, 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  isError,
  Ok,
  StringRoomIDSchema,
  Value,
} from "matrix-protection-suite";
import { MatrixSendClient } from "./MatrixEmitter";
import {
  MatrixRoomReference,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";
import { resultifyBotSDKRequestError } from "./Client/BotSDKBaseClient";
import { Result } from "@gnuxie/typescript-result";

const RoomResolveResponse = Type.Object({
  room_id: StringRoomIDSchema,
  servers: Type.Array(Type.String()),
});

export async function resolveRoomReferenceSafe(
  client: MatrixSendClient,
  roomRef: MatrixRoomReference
): Promise<Result<MatrixRoomID>> {
  if (roomRef instanceof MatrixRoomID) {
    return Ok(roomRef);
  }
  return await client
    .doRequest(
      "GET",
      `/_matrix/client/v3/directory/room/${encodeURIComponent(
        roomRef.toRoomIDOrAlias()
      )}`
    )
    .then((value) => {
      const response = Value.Decode(RoomResolveResponse, value);
      if (isError(response)) {
        return response;
      }
      return Ok(new MatrixRoomID(response.ok.room_id, response.ok.servers));
    }, resultifyBotSDKRequestError);
}
