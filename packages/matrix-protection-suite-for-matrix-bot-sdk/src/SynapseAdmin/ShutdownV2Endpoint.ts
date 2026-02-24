// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import { EDStatic } from "matrix-protection-suite";

export type SynapseRoomShutdownV2RequestBody = EDStatic<
  typeof SynapseRoomShutdownV2RequestBody
>;
export const SynapseRoomShutdownV2RequestBody = Type.Object(
  {
    new_room_user_id: Type.Optional(
      Type.String({
        description:
          "User ID of the creator/admin for the new room. Must be local but not necessarily registered.",
      })
    ),
    room_name: Type.Optional(
      Type.String({
        description:
          "Name of the new room. Defaults to 'Content Violation Notification'.",
      })
    ),
    message: Type.Optional(
      Type.String({
        description:
          "First message in the new room. Defaults to 'Sharing illegal content on this server is not permitted and rooms in violation will be blocked.'",
      })
    ),
    block: Type.Optional(
      Type.Boolean({
        description:
          "If true, prevents future attempts to join the room. Defaults to false.",
      })
    ),
    purge: Type.Optional(
      Type.Boolean({
        description:
          "If true, removes all traces of the room from the database. Defaults to true.",
      })
    ),
    force_purge: Type.Optional(
      Type.Boolean({
        description:
          "If true, forces purge even if local users are still in the room. Only applies if 'purge' is true.",
      })
    ),
  },
  { minProperties: 1, description: "Request body must not be empty." }
);
