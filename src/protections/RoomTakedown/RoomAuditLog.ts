// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule } from "matrix-protection-suite";

// FIXME: Add a method for protection startup that takes all room ids from policies
//        and only returns those not takendown
// i just want to save progress so far first.
export interface RoomAuditLog {
  takedownRoom(policy: LiteralPolicyRule): Promise<Result<void>>;
  isRoomTakendown(roomID: StringRoomID): boolean;
}
