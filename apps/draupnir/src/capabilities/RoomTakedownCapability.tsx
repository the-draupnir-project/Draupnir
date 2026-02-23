// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  Capability,
  CapabilityMethodSchema,
  describeCapabilityInterface,
  RoomBasicDetails,
} from "matrix-protection-suite";

export interface RoomDetailsProvider {
  getRoomDetails(roomID: StringRoomID): Promise<Result<RoomBasicDetails>>;
}

export const RoomTakedownCapability = Type.Intersect([
  Type.Object({
    isRoomTakendown: CapabilityMethodSchema,
    takedownRoom: CapabilityMethodSchema,
  }),
  Capability,
]);
// we'll probably want to include room details too so we can provide some
// rudinemtary information to takedown.
// I'd make the fields optional however because it may be impossible
// to get those details on conduwuit.
export type RoomTakedownCapability = {
  isRoomTakendown(roomID: StringRoomID): Promise<Result<boolean>>;
  takedownRoom(roomID: StringRoomID): Promise<Result<RoomBasicDetails>>;
} & RoomDetailsProvider &
  Capability;

describeCapabilityInterface({
  name: "RoomTakedownCapability",
  description: "Capability that targets matrix rooms",
  schema: RoomTakedownCapability,
});
