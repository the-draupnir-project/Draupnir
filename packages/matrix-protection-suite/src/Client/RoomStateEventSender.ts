// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixRoomID,
  StringRoomID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";

export interface RoomStateEventSender {
  sendStateEvent(
    room: MatrixRoomID | StringRoomID,
    stateType: string,
    stateKey: string,
    content: Record<string, unknown>
  ): Promise<ActionResult<StringEventID>>;
}
