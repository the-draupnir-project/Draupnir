// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import { EDStatic, StringUserIDSchema } from "matrix-protection-suite";

export type BlockStatusResponse = EDStatic<typeof BlockStatusResponse>;
export const BlockStatusResponse = Type.Object({
  block: Type.Boolean({
    description: "True if the room is blocked, otherwise false.",
  }),
  user_id: Type.Optional(
    Type.Union([StringUserIDSchema], {
      description:
        "User ID of the person who added the room to the blocking list. Only present if 'block' is true.",
    })
  ),
});
