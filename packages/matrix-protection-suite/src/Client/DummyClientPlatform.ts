// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixRoomReference,
  StringRoomAlias,
  StringRoomID,
  isStringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { Ok } from "../Interface/Action";
import { RoomJoiner } from "./RoomJoiner";
import { Result } from "@gnuxie/typescript-result";

export async function resolveRoomFake(
  roomID: MatrixRoomReference | string
): Promise<Result<MatrixRoomID>> {
  if (typeof roomID === "string") {
    if (!isStringRoomID(roomID)) {
      throw new TypeError(`Fake can't deal with aliases.`);
    } else {
      return Ok(MatrixRoomReference.fromRoomID(roomID));
    }
  } else if (roomID instanceof MatrixRoomAlias) {
    throw new TypeError(`Fake can't deal with aliases.`);
  } else {
    return Ok(roomID);
  }
}

export const DummyRoomJoiner: RoomJoiner = Object.freeze({
  async joinRoom(room: MatrixRoomReference | StringRoomAlias | StringRoomID) {
    return await resolveRoomFake(room);
  },
  resolveRoom: resolveRoomFake,
});
