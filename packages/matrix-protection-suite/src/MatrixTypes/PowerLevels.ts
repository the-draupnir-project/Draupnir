// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2016 OpenMarket Ltd
// Copyright 2018 New Vector Ltd
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-spec
// https://github.com/matrix-org/matrix-spec
// </text>

import { StaticDecode, Type } from "@sinclair/typebox";
import { StateEvent } from "./Events";
import { EDStatic } from "../Interface/Static";

export type PowerLevelsEventContent = StaticDecode<
  typeof PowerLevelsEventContent
>;
export const PowerLevelsEventContent = Type.Object({
  ban: Type.Optional(
    Type.Number({
      description:
        "The level required to ban a user. Defaults to 50 if unspecified.",
    })
  ),
  events: Type.Optional(Type.Record(Type.String(), Type.Number())),
  events_default: Type.Optional(
    Type.Number({
      description:
        "The default level required to send message events. Can be\noverridden by the `events` key.  Defaults to 0 if unspecified.",
    })
  ),
  invite: Type.Optional(
    Type.Number({
      description:
        "The level required to invite a user. Defaults to 0 if unspecified.",
    })
  ),
  kick: Type.Optional(
    Type.Number({
      description:
        "The level required to kick a user. Defaults to 50 if unspecified.",
    })
  ),
  redact: Type.Optional(
    Type.Number({
      description:
        "The level required to redact an event sent by another user. Defaults to 50 if unspecified.",
    })
  ),
  state_default: Type.Optional(
    Type.Number({
      description:
        "The default level required to send state events. Can be overridden\nby the `events` key. Defaults to 50 if unspecified.",
    })
  ),
  users: Type.Optional(Type.Record(Type.String(), Type.Number())),
  users_default: Type.Optional(
    Type.Number({
      description:
        "The power level for users in the room whose `user_id` is not mentioned in the `users` key. Defaults to 0 if\nunspecified.\n\n**Note**: When there is no `m.room.power_levels` event in the room, the room creator has\na power level of 100, and all other users have a power level of 0.     ",
    })
  ),
  notifications: Type.Optional(
    Type.Object(
      {
        room: Type.Optional(
          Type.Number({
            description:
              "The level required to trigger an `@room` notification. Defaults to 50 if unspecified.",
          })
        ),
      },
      { additionalProperties: Type.Number() }
    )
  ),
});

export type PowerLevelsEvent = EDStatic<typeof PowerLevelsEvent>;
export const PowerLevelsEvent = Type.Intersect([
  Type.Omit(StateEvent(PowerLevelsEventContent), ["state_key", "type"]),
  Type.Object({
    state_key: Type.String({
      description: "A zero-length string.",
      pattern: "^$",
    }),
    type: Type.Literal("m.room.power_levels"),
  }),
]);
