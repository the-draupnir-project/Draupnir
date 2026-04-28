// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { StateEvent } from "../MatrixTypes/Events";
import { Result } from "@gnuxie/typescript-result";

// Honestly in future I don't know if rooms should even be accepting room for
// an argument? but then what about state type and state key?
// idk the capabilities should be forced to describe what rooms they are for
// when created.
export interface RoomStateGetter {
  getAllState<T extends StateEvent>(
    room: MatrixRoomID | StringRoomID
  ): Promise<Result<T[]>>;
}
