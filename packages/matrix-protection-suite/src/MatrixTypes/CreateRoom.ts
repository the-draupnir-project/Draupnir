// Copyright 2023 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2016 OpenMarket Ltd
// Copyright 2018 New Vector Ltd
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-spec
// https://github.com/matrix-org/matrix-spec
// </text>

import { Static, Type } from "@sinclair/typebox";
import { PowerLevelsEventContent } from "./PowerLevels";
import { StringUserIDSchema } from "./StringlyTypedMatrix";
import { StateEvent } from "./Events";
import { isError, Ok, ResultError } from "@gnuxie/typescript-result";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

export type RoomCreateOptions = Static<typeof RoomCreateOptions>;
export const RoomCreateOptions = Type.Object({
  visibility: Type.Optional(
    Type.Union([Type.Literal("public"), Type.Literal("private")])
  ),
  room_alias_name: Type.Optional(
    Type.String({
      description:
        'The desired room alias **local part**. If this is included, a\nroom alias will be created and mapped to the newly created\nroom. The alias will belong on the *same* homeserver which\ncreated the room. For example, if this was set to "foo" and\nsent to the homeserver "example.com" the complete room alias\nwould be `#foo:example.com`.\n\nThe complete room alias will become the canonical alias for\nthe room and an `m.room.canonical_alias` event will be sent\ninto the room.',
    })
  ),
  name: Type.Optional(
    Type.String({
      description:
        "If this is included, an `m.room.name` event will be sent\ninto the room to indicate the name of the room. See Room\nEvents for more information on `m.room.name`.",
    })
  ),
  topic: Type.Optional(
    Type.String({
      description:
        "If this is included, an `m.room.topic` event will be sent\ninto the room to indicate the topic for the room. See Room\nEvents for more information on `m.room.topic`.",
    })
  ),
  invite: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "A list of user IDs to invite to the room. This will tell the\nserver to invite everyone in the list to the newly created room.",
    })
  ),
  invite_3pid: Type.Optional(
    Type.Array(
      Type.Object({
        id_server: Type.String({
          description:
            "The hostname+port of the identity server which should be used for third-party identifier lookups.",
        }),
        id_access_token: Type.String({
          description:
            "An access token previously registered with the identity server. Servers\ncan treat this as optional to distinguish between r0.5-compatible clients\nand this specification version.",
        }),
        medium: Type.String({
          description:
            "The kind of address being passed in the address field, for example `email`\n(see [the list of recognised values](/appendices/#3pid-types)).",
        }),
        address: Type.String({
          description: "The invitee's third-party identifier.",
        }),
      }),
      {
        description:
          "A list of objects representing third-party IDs to invite into\nthe room.",
      }
    )
  ),
  room_version: Type.Optional(
    Type.String({
      description:
        "The room version to set for the room. If not provided, the homeserver is\nto use its configured default. If provided, the homeserver will return a\n400 error with the errcode `M_UNSUPPORTED_ROOM_VERSION` if it does not\nsupport the room version.",
      example: "1",
    })
  ),
  creation_content: Type.Optional(
    Type.Object({
      type: Type.Optional(Type.String({ description: "The type of the room" })),
    })
  ),
  initial_state: Type.Optional(
    Type.Array(
      Type.Object({
        type: Type.String({ description: "The type of event to send." }),
        state_key: Type.Optional(
          Type.String({
            description:
              "The state_key of the state event. Defaults to an empty string.",
          })
        ),
        content: Type.Unknown(),
      }),
      {
        description:
          "A list of state events to set in the new room. This allows\nthe user to override the default state events set in the new\nroom. The expected format of the state events are an object\nwith type, state_key and content keys set.\n\nTakes precedence over events set by `preset`, but gets\noverridden by `name` and `topic` keys.",
      }
    )
  ),
  preset: Type.Optional(
    Type.Union([
      Type.Literal("private_chat"),
      Type.Literal("public_chat"),
      Type.Literal("trusted_private_chat"),
    ])
  ),
  is_direct: Type.Optional(
    Type.Boolean({
      description:
        "This flag makes the server set the `is_direct` flag on the\n`m.room.member` events sent to the users in `invite` and\n`invite_3pid`. See [Direct Messaging](/client-server-api/#direct-messaging) for more information.",
    })
  ),
  power_level_content_override: Type.Optional(PowerLevelsEventContent),
});

export type RoomCreateContent = Static<typeof RoomCreateContent>;
export const RoomCreateContent = Type.Object({
  creator: Type.Optional(
    Type.String({
      description:
        "The `user_id` of the room creator. **Required** for, and only present in, room versions 1 - 10. Starting with\nroom version 11 the event `sender` should be used instead.",
    })
  ),
  "m.federate": Type.Optional(
    Type.Boolean({
      description:
        "Whether users on other servers can join this room. Defaults to `true` if key does not exist.",
    })
  ),
  room_version: Type.Optional(
    Type.String({
      description:
        'The version of the room. Defaults to `"1"` if the key does not exist.',
    })
  ),
  type: Type.Optional(
    Type.String({
      description:
        "Optional [room type](/client-server-api/#types) to denote a room's intended function outside of traditional\nconversation.\n\nUnspecified room types are possible using [Namespaced Identifiers](/appendices/#common-namespaced-identifier-grammar).",
    })
  ),
  predecessor: Type.Optional(
    Type.Object({
      room_id: Type.String({ description: "The ID of the old room." }),
      event_id: Type.Optional(
        Type.String({
          description: "The event ID of the last known event in the old room.",
        })
      ),
    })
  ),
  additional_creators: Type.Optional(
    Type.Array(StringUserIDSchema, {
      description:
        "These are users with infinite power level when the room version is 12 and above.",
    })
  ),
});

export type RoomCreateEvent = Static<typeof RoomCreateEvent>;
export const RoomCreateEvent = Type.Intersect([
  Type.Omit(StateEvent(RoomCreateContent), ["state_key", "type"]),
  Type.Object({
    state_key: Type.String({
      description: "A zero-length string.",
      pattern: "^$",
    }),
    type: Type.Literal("m.room.create"),
  }),
]);

// FIXME: SHouldn't the privileged creators function return a result error?
// i think so, but it just depends how the permission calculation system
// uses it and whether it supports feeding errors back.
export const RoomVersionMirror = Object.freeze({
  isVersionWithPrivilegedCreators(versionSpecifier: string): boolean {
    const integerResult = (() => {
      try {
        return Ok(parseInt(versionSpecifier, 10));
      } catch (e) {
        if (e instanceof Error) {
          return ResultError.Result(e.message);
        }
        throw e; // we don't know what this is.
      }
    })();
    if (isError(integerResult)) {
      return false; // unknown room version.
    }
    if (integerResult.ok >= 12) {
      return true; // versions 12 and above have privileged creators.
    }
    return false;
  },
  isUserAPrivilegedCreator(
    userID: StringUserID,
    creationEvent: RoomCreateEvent
  ): boolean {
    if (creationEvent.content.room_version === undefined) {
      return false;
    }
    if (
      !this.isVersionWithPrivilegedCreators(creationEvent.content.room_version)
    ) {
      return false;
    }
    if (userID === creationEvent.sender) {
      return true;
    }
    if (creationEvent.content.additional_creators?.includes(userID)) {
      return true;
    }
    return false;
  },
  privilegedCreators(creationEvent: RoomCreateEvent): StringUserID[] {
    if (
      creationEvent.content.room_version === undefined ||
      !this.isVersionWithPrivilegedCreators(creationEvent.content.room_version)
    ) {
      return [creationEvent.sender];
    }
    return [
      creationEvent.sender,
      ...(creationEvent.content.additional_creators ?? []),
    ];
  },
});
