// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import {
  isStringUserID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  EDStatic,
  StringRoomAliasSchema,
  StringRoomIDSchema,
} from "matrix-protection-suite";

// There is a bug in Synapse at the moment where the creator can be blank.
// https://github.com/element-hq/synapse/issues/18563
export const BrokenRoomCreatorTransform = Type.Transform(
  Type.Union([Type.Null(), Type.String()])
)
  .Decode((value) => {
    if (value === "" || value === null) {
      return null;
    } else if (isStringUserID(value)) {
      return value;
    } else {
      throw new TypeError("Invalid creator user ID format.");
    }
  })
  .Encode((value) => (value === null ? "" : StringUserID(value)));

export type RoomDetailsResponse = EDStatic<typeof RoomDetailsResponse>;
export const RoomDetailsResponse = Type.Object({
  room_id: StringRoomIDSchema,
  name: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: "The name of the room.",
    })
  ),
  topic: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: "The topic of the room.",
    })
  ),
  avatar: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: "The mxc URI to the avatar of the room.",
    })
  ),
  canonical_alias: Type.Optional(
    Type.Union([StringRoomAliasSchema, Type.String(), Type.Null()], {
      description: "The canonical (main) alias address of the room.",
    })
  ),
  joined_members: Type.Optional(
    Type.Union([
      Type.Number({
        description: "How many users are currently in the room.",
      }),
      Type.Null(),
    ])
  ),
  joined_local_members: Type.Optional(
    Type.Union([
      Type.Number({
        description: "How many local users are currently in the room.",
      }),
      Type.Null(),
    ])
  ),
  joined_local_devices: Type.Optional(
    Type.Union([
      Type.Number({
        description: "How many local devices are currently in the room.",
      }),
      Type.Null(),
    ])
  ),
  version: Type.Optional(
    Type.Union([
      Type.String({ description: "The version of the room as a string." }),
      Type.Null(),
    ])
  ),
  creator: Type.Union([BrokenRoomCreatorTransform], {
    description: "The user_id of the room creator.",
  }),
  encryption: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description:
        "Algorithm of end-to-end encryption of messages. Null if encryption is not active.",
    })
  ),
  federatable: Type.Optional(
    Type.Union([
      Type.Boolean({
        description: "Whether users on other servers can join this room.",
      }),
      Type.Null(),
    ])
  ),
  public: Type.Optional(
    Type.Union([
      Type.Boolean({
        description: "Whether the room is visible in the room directory.",
      }),
      Type.Null(),
    ])
  ),
  join_rules: Type.Optional(
    Type.Union(
      [
        Type.Literal("public"),
        Type.Literal("knock"),
        Type.Literal("knock_restricted"),
        Type.Literal("invite"),
        Type.Literal("private"),
        Type.Literal("restricted"),
        Type.String(),
        Type.Null(),
      ],
      {
        description:
          "The type of rules used for users wishing to join this room.",
      }
    )
  ),
  guest_access: Type.Optional(
    Type.Union(
      [Type.Literal("can_join"), Type.Literal("forbidden"), Type.Null()],
      { description: "Whether guests can join the room." }
    )
  ),
  history_visibility: Type.Optional(
    Type.Union(
      [
        Type.Literal("invited"),
        Type.Literal("joined"),
        Type.Literal("shared"),
        Type.Literal("world_readable"),
        Type.Null(),
      ],
      { description: "Who can see the room history." }
    )
  ),
  state_events: Type.Optional(
    Type.Union([
      Type.Number({
        description:
          "Total number of state events in the room. Represents the complexity of the room.",
      }),
      Type.Null(),
    ])
  ),
  room_type: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description:
        "The type of the room from the room's creation event, e.g., 'm.space'. Null if not defined.",
    })
  ),
  forgotten: Type.Optional(
    Type.Union([
      Type.Boolean({
        description: "Whether all local users have forgotten the room.",
      }),
      Type.Null(),
    ])
  ),
});
