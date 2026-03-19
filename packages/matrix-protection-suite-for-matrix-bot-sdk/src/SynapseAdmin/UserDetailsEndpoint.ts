// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import { EDStatic } from "matrix-protection-suite";

export type UserDetailsResponse = EDStatic<typeof UserDetailsResponse>;
export const UserDetailsResponse = Type.Object({
  name: Type.String({
    description: "Fully-qualified user ID (e.g., @user:server.com).",
  }),
  is_guest: Type.Boolean({
    description: "Status if that user is a guest account.",
  }),
  admin: Type.Boolean({
    description: "Status if that user is a server administrator.",
  }),
  user_type: Type.Union(
    [Type.Literal("support"), Type.Literal("bot"), Type.Null()],
    {
      description:
        "Type of the user. Normal users are type null. Other possible types include 'support' and 'bot'.",
    }
  ),
  deactivated: Type.Boolean({
    description: "Status if that user has been marked as deactivated.",
  }),
  erased: Type.Boolean({
    description: "Status if that user has been marked as erased.",
  }),
  shadow_banned: Type.Boolean({
    description: "Status if that user has been marked as shadow banned.",
  }),
  displayname: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: "The user's display name if they have set one.",
    })
  ),
  avatar_url: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: "The user's avatar URL if they have set one.",
    })
  ),
  creation_ts: Type.Integer({
    description: "The user's creation timestamp in ms.",
  }),
  last_seen_ts: Type.Integer({
    description: "The user's last activity timestamp in ms.",
  }),
  locked: Type.Boolean({
    description: "Status if that user has been marked as locked.",
  }),
  suspended: Type.Boolean({
    description: "Whether the user is suspended",
  }),
});
