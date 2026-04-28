// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixRoomID,
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";

export interface RoomEventRedacter {
  redactEvent(
    room: MatrixRoomID | StringRoomID,
    eventID: StringEventID,
    reason?: string
  ): Promise<ActionResult<StringEventID>>;
}
