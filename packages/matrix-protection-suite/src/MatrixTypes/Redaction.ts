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
import { RoomEvent } from "./Events";
import { StringEventIDSchema } from "./StringlyTypedMatrix";
import { EDStatic } from "../Interface/Static";
import { StringEventID } from "@the-draupnir-project/matrix-basic-types";

export type RedactionContent = EDStatic<typeof RedactionContent>;
export const RedactionContent = Type.Object({
  redacts: Type.Optional(
    Type.Union([StringEventIDSchema], {
      description:
        "The event ID that was redacted. Required for, and present starting in, room version 11. This is protected from redaction.",
    })
  ),
  reason: Type.Optional(
    Type.String({ description: "The reason for the redaction, if any." })
  ),
});

export type Redaction = EDStatic<typeof Redaction>;
export const Redaction = Type.Intersect([
  Type.Omit(RoomEvent(RedactionContent), ["type"]),
  Type.Object({
    redacts: Type.Optional(
      Type.Union([StringEventIDSchema], {
        description:
          "Required for, and only present in, room versions 1 - 10. The event ID that was redacted. This is not protected from redaction and can be removed in room versions prior to v11.",
      })
    ),
    type: Type.Literal("m.room.redaction"),
  }),
]);

export function redactionTargetEvent(
  event: Redaction
): StringEventID | undefined {
  return event.redacts ?? event.content.redacts;
}
