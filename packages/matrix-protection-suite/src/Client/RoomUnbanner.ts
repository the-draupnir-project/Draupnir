// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";

export interface RoomUnbanner {
  unbanUser(
    room: MatrixRoomID | StringRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>>;
}
