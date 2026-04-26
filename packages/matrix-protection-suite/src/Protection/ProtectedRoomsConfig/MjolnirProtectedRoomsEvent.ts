// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { StaticDecode, Type } from "@sinclair/typebox";
import { Value } from "../../Interface/Value";
import { StringRoomIDSchema } from "../../MatrixTypes/StringlyTypedMatrix";

export type MjolnirProtectedRoomsEvent = StaticDecode<
  typeof MjolnirProtectedRoomsEvent
>;
export const MjolnirProtectedRoomsEvent = Type.Object({
  rooms: Type.Array(StringRoomIDSchema),
});
Value.Compile(MjolnirProtectedRoomsEvent);

export const MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE =
  "org.matrix.mjolnir.protected_rooms";
