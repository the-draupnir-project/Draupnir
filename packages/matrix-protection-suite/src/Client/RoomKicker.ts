// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";

export interface RoomKicker {
  kickUser(
    room: MatrixRoomID | StringRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>>;
}
