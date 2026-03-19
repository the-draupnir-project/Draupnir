// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { RoomEvent } from "../MatrixTypes/Events";
import { UnsafeContentKey } from "./SafeMembershipEvent";

export interface UnsafeEvent extends RoomEvent {
  [UnsafeContentKey]?: unknown;
}
