// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixRoomID,
  MatrixRoomReference,
  StringRoomAlias,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";
import { RoomResolver } from "./RoomResolver";

type JoinRoomOptions = {
  /**
   * Whether to call `/join` regardless of whether we know we are
   * already joined to the room.
   */
  alwaysCallJoin?: boolean;
};

export interface RoomJoiner extends RoomResolver {
  joinRoom(
    room: MatrixRoomReference | StringRoomID | StringRoomAlias,
    options?: JoinRoomOptions
  ): Promise<ActionResult<MatrixRoomID>>;
}
