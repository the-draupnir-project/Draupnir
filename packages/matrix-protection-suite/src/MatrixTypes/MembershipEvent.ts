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

import { Type } from "@sinclair/typebox";
import { StateEvent, StrippedStateEvent, UnsignedData } from "./Events";
import { StringUserIDSchema } from "./StringlyTypedMatrix";
import { EDStatic } from "../Interface/Static";

export type MembershipEventUnsigned = EDStatic<typeof MembershipEventUnsigned>;
export const MembershipEventUnsigned = Type.Intersect([
  UnsignedData,
  Type.Object({
    invite_room_state: Type.Optional(
      Type.Array(StrippedStateEvent, {
        description:
          "A subset of the state of the room at the time of the invite, if `membership` is `invite`.\nNote that this state is informational, and SHOULD NOT be trusted; once the client has\njoined the room, it SHOULD fetch the live state from the server and discard the\ninvite_room_state. Also, clients must not rely on any particular state being present here;\nthey SHOULD behave properly (with possibly a degraded but not a broken experience) in\nthe absence of any particular events here. If they are set on the room, at least the\nstate for `m.room.avatar`, `m.room.canonical_alias`, `m.room.join_rules`, and `m.room.name`\nSHOULD be included.",
      })
    ),
    knock_room_state: Type.Optional(
      Type.Array(StrippedStateEvent, {
        description:
          "A subset of the state of the room at the time of the knock, if `membership` is `knock`.\nThis has the same restrictions as `invite_room_state`. If they are set on the room, at least\nthe state for `m.room.avatar`, `m.room.canonical_alias`, `m.room.join_rules`, `m.room.name`,\nand `m.room.encryption` SHOULD be included.",
      })
    ),
  }),
]);

export type MembershipEventContent = EDStatic<typeof MembershipEventContent>;
export const MembershipEventContent = Type.Object({
  avatar_url: Type.Optional(
    Type.String({
      description: "The avatar URL for this user, if any.",
    })
  ),
  displayname: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  membership: Type.Union([
    Type.Literal("invite"),
    Type.Literal("join"),
    Type.Literal("knock"),
    Type.Literal("leave"),
    Type.Literal("ban"),
  ]),
  is_direct: Type.Optional(
    Type.Boolean({
      description:
        "Flag indicating if the room containing this event was created with the intention of being a direct chat. See [Direct Messaging](/client-server-api/#direct-messaging).",
    })
  ),
  join_authorised_via_users_server: Type.Optional(
    Type.String({
      "x-addedInMatrixVersion": "1.2",
      description:
        "Usually found on `join` events, this field is used to denote which homeserver (through representation of a user with sufficient power level)\nauthorised the user's join. More information about this field can be found in the [Restricted Rooms Specification](#restricted-rooms).\n\nClient and server implementations should be aware of the [signing implications](/rooms/v8/#authorization-rules) of including this\nfield in further events: in particular, the event must be signed by the server which\nowns the user ID in the field. When copying the membership event's `content`\n(for profile updates and similar) it is therefore encouraged to exclude this\nfield in the copy, as otherwise the event might fail event authorization.",
    })
  ),
  reason: Type.Optional(
    Type.String({
      "x-addedInMatrixVersion": "1.1",
      description:
        "Optional user-supplied text for why their membership has changed. For kicks and bans, this is typically the reason for the kick or ban.\nFor other membership changes, this is a way for the user to communicate their intent without having to send a message to the room, such\nas in a case where Bob rejects an invite from Alice about an upcoming concert, but can't make it that day.\n\nClients are not recommended to show this reason to users when receiving an invite due to the potential for spam and abuse. Hiding the\nreason behind a button or other component is recommended.",
    })
  ),
  third_party_invite: Type.Optional(
    Type.Object({
      display_name: Type.String({
        description:
          "A name which can be displayed to represent the user instead of their third-party identifier",
      }),
      signed: Type.Object({
        mxid: Type.String({
          description:
            "The invited matrix user ID. Must be equal to the user_id property of the event.",
        }),
        signatures: Type.Unknown(),
        token: Type.String({
          description:
            "The token property of the containing third_party_invite object.",
        }),
      }),
    })
  ),
});

export type BaseMembershipEvent = EDStatic<typeof BaseMembershipEvent>;
export const BaseMembershipEvent = Type.Intersect([
  Type.Omit(StateEvent(Type.Object({})), ["state_key", "unsigned", "type"]),
  Type.Object({
    state_key: StringUserIDSchema,
    type: Type.Literal("m.room.member"),
    unsigned: Type.Optional(MembershipEventUnsigned),
  }),
]);

export type MembershipEvent = EDStatic<typeof MembershipEvent>;
export const MembershipEvent = Type.Intersect([
  Type.Omit(BaseMembershipEvent, ["content"]),
  Type.Object({
    content: MembershipEventContent,
  }),
]);
