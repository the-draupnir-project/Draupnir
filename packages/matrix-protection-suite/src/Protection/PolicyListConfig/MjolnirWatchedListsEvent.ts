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
import { RoomReferencePermalinkSchema } from "../../MatrixTypes/PermalinkSchema";

export type MjolnirWatchedPolicyRoomsEvent = StaticDecode<
  typeof MjolnirWatchedPolicyRoomsEvent
>;
export const MjolnirWatchedPolicyRoomsEvent = Type.Object({
  references: Type.Array(RoomReferencePermalinkSchema),
});
Value.Compile(MjolnirWatchedPolicyRoomsEvent);

export const MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE =
  "org.matrix.mjolnir.watched_lists";
