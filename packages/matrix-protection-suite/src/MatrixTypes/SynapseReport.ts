// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from synapse
// https://github.com/matrix-org/synapse
// </text>

import { StaticDecode, Type } from "@sinclair/typebox";
import {
  StringEventIDSchema,
  StringRoomIDSchema,
  StringUserIDSchema,
} from "./StringlyTypedMatrix";

export type SynapseReport = StaticDecode<typeof SynapseReport>;
export const SynapseReport = Type.Object({
  id: Type.Integer({
    description: "ID of event report.",
  }),
  room_id: StringRoomIDSchema,
  name: Type.Union([
    Type.String({
      description:
        "The ID of the room in which the event being reported is located.",
    }),
    Type.Null(),
  ]),
  event_id: StringEventIDSchema,
  sender: StringUserIDSchema,
  user_id: StringUserIDSchema,
  reason: Type.Optional(
    Type.Union([Type.Null(), Type.String()], {
      description:
        "Comment made by the user_id in this report. May be blank or null.",
    })
  ),
});
