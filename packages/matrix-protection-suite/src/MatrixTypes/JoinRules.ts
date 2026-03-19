// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2018 New Vector Ltd
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-spec
// https://github.com/matrix-org/matrix-spec
// </text>

import { Type } from "@sinclair/typebox";
import { EDStatic } from "../Interface/Static";
import { StateEvent } from "./Events";

export type JoinRulesEventContent = EDStatic<typeof JoinRulesEventContent>;
export const JoinRulesEventContent = Type.Object({
  join_rule: Type.Union([
    Type.Literal("public"),
    Type.Literal("knock"),
    Type.Literal("invite"),
    Type.Literal("private"),
    Type.Literal("restricted"),
    Type.Literal("knock_restricted"),
  ]),
  allow: Type.Optional(
    Type.Array(
      Type.Object({
        type: Type.Union([Type.Literal("m.room_membership")]),
        room_id: Type.Optional(
          Type.String({
            description:
              "Required if `type` is `m.room_membership`. The room ID to check the\nuser's membership against. If the user is joined to this room, they\nsatisfy the condition and thus are permitted to join the `restricted`\nroom.",
          })
        ),
      }),
      {
        description:
          "For `restricted` rooms, the conditions the user will be tested against. The\nuser needs only to satisfy one of the conditions to join the `restricted`\nroom. If the user fails to meet any condition, or the condition is unable\nto be confirmed as satisfied, then the user requires an invite to join the\nroom. Improper or no `allow` conditions on a `restricted` join rule imply\nthe room is effectively invite-only (no conditions can be satisfied).",
      }
    )
  ),
});

export type JoinRulesEvent = EDStatic<typeof JoinRulesEvent>;
export const JoinRulesEvent = Type.Intersect([
  Type.Omit(StateEvent(JoinRulesEventContent), ["state_key", "type"]),
  Type.Object({
    state_key: Type.String({
      description: "A zero-length string.",
      pattern: "^$",
    }),
    type: Type.Union([Type.Literal("m.room.join_rules")]),
  }),
]);
