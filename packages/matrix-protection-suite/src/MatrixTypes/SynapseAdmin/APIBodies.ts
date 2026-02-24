// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from synapse
// https://github.com/matrix-org/synapse
// </text>

import { StaticDecode, Type } from "@sinclair/typebox";
import { StringUserIDSchema } from "../StringlyTypedMatrix";

export type SynapseAdminGetUserAdminResponse = StaticDecode<
  typeof SynapseAdminGetUserAdminResponse
>;
export const SynapseAdminGetUserAdminResponse = Type.Object({
  admin: Type.Optional(Type.Union([Type.Null(), Type.Boolean()])),
});

export type SynapseAdminPostUserDeactivateRequest = StaticDecode<
  typeof SynapseAdminPostUserDeactivateRequest
>;
export const SynapseAdminPostUserDeactivateRequest = Type.Object({
  erase: Type.Optional(Type.Boolean({ default: false })),
});

export type SynapseAdminDeleteRoomRequest = StaticDecode<
  typeof SynapseAdminDeleteRoomRequest
>;
export const SynapseAdminDeleteRoomRequest = Type.Object({
  new_room_user_id: Type.Union([Type.Optional(StringUserIDSchema)], {
    description:
      " If set, a new room will be created with this user ID as the creator and admin, and all users in the old room will be moved into that room. If not set, no new room will be created and the users will just be removed from the old room. The user ID must be on the local server, but does not necessarily have to belong to a registered user.",
  }),
  room_name: Type.Optional(
    Type.String({
      description:
        "A string representing the name of the room that new users will be invited to. Defaults to Content Violation Notification",
    })
  ),
  message: Type.Optional(
    Type.String({
      description:
        "A string containing the first message that will be sent as new_room_user_id in the new room. Ideally this will clearly convey why the original room was shut down. Defaults to Sharing illegal content on this server is not permitted and rooms in violation will be blocked.",
    })
  ),
  block: Type.Optional(
    Type.Boolean({
      description:
        "block - Optional. If set to true, this room will be added to a blocking list, preventing future attempts to join the room. Defaults to true. Defaults to false in Synapse (annoyingly)",
      default: true,
    })
  ),
  purge: Type.Optional(
    Type.Boolean({
      description:
        "If set to true, it will remove all traces of the room from your database. Defaults to true.",
      default: true,
    })
  ),
  force_purge: Type.Optional(
    Type.Boolean({
      description:
        "Optional, and ignored unless purge is true. If set to true, it will force a purge to go ahead even if there are local users still in the room. Do not use this unless a regular purge operation fails, as it could leave those users' clients in a confused state.",
      default: false,
    })
  ),
});

export type SynapseAdminPostMakeRoomAdminRequest = StaticDecode<
  typeof SynapseAdminPostMakeRoomAdminRequest
>;
export const SynapseAdminPostMakeRoomAdminRequest = Type.Object({
  user_id: StringUserIDSchema,
});
