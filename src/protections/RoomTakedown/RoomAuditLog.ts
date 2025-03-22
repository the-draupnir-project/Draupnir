// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule, RoomBasicDetails } from "matrix-protection-suite";

export type RoomTakedownDetails = Omit<RoomBasicDetails, "avatar"> & {
  policy_id: StringEventID;
  created_at: number;
};

export interface RoomAuditLog {
  takedownRoom(
    policy: LiteralPolicyRule,
    details: RoomBasicDetails
  ): Promise<Result<void>>;
  isRoomTakendown(roomID: StringRoomID): boolean;
  getTakedownDetails(
    roomID: StringRoomID
  ): Promise<Result<RoomTakedownDetails | undefined>>;
}
