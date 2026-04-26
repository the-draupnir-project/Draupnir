// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringEventID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomEvent } from "../MatrixTypes/Events";

export interface EventReport {
  event_id: StringEventID;
  room_id: StringRoomID;
  sender: StringUserID;
  reason?: string;
  event: RoomEvent;
  received_ts?: number;
}
