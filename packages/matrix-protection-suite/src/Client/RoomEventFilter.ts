// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Type, Static } from "@sinclair/typebox";
import {
  StringRoomIDSchema,
  StringUserIDSchema,
} from "../MatrixTypes/StringlyTypedMatrix";

export const RoomEventFilter = Type.Object({
  limit: Type.Optional(Type.Number()),
  senders: Type.Optional(Type.Array(StringUserIDSchema)),
  not_senders: Type.Optional(Type.Array(StringUserIDSchema)),
  types: Type.Optional(Type.Array(Type.String())),
  not_types: Type.Optional(Type.Array(Type.String())),
  rooms: Type.Optional(Type.Array(StringRoomIDSchema)),
  not_rooms: Type.Optional(Type.Array(StringRoomIDSchema)),
  contains_url: Type.Optional(Type.Boolean()),
  lazy_load_members: Type.Optional(Type.Boolean()),
  include_redundant_members: Type.Optional(Type.Boolean()),
});

export type RoomEventFilter = Static<typeof RoomEventFilter>;
