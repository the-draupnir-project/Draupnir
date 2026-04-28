// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomEvent } from "../MatrixTypes/Events";
import { Result } from "@gnuxie/typescript-result";

export interface RoomEventGetter {
  getEvent<TRoomEvent extends RoomEvent>(
    roomID: StringRoomID,
    eventID: StringEventID
  ): Promise<Result<TRoomEvent>>;

  getUndecodedEvent(
    roomID: StringRoomID,
    eventID: StringEventID
  ): Promise<Result<Record<string, unknown>>>;
}
