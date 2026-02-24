// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";
import { RoomCreateOptions } from "../MatrixTypes/CreateRoom";

export interface RoomCreator {
  createRoom(options: RoomCreateOptions): Promise<ActionResult<MatrixRoomID>>;
}
