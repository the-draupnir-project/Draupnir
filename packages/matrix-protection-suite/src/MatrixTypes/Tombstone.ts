// Copyright 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2018 New Vector Ltd
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-spec
// https://github.com/matrix-org/matrix-spec
// </text>

import { Static, Type } from "@sinclair/typebox";
import { StateEvent } from "./Events";
import { EDStatic } from "../Interface/Static";
import { StringRoomIDSchema } from "./StringlyTypedMatrix";

export type TombstoneEventContent = Static<typeof TombstoneEventContent>;
export const TombstoneEventContent = Type.Partial(
  Type.Object({
    body: Type.String({ description: "A server-defined message." }),
    replacement_room: Type.Union([StringRoomIDSchema], {
      description: "The room ID of the new room the client should be visiting.",
    }),
  })
);

export type TombstoneEvent = EDStatic<typeof TombstoneEvent>;
export const TombstoneEvent = Type.Intersect([
  Type.Omit(StateEvent(TombstoneEventContent), ["state_key", "type"]),
  Type.Object({
    state_key: Type.String({
      description: "A zero-length string.",
      pattern: "^$",
    }),
    type: Type.Union([Type.Literal("m.room.tombstone")]),
  }),
]);
