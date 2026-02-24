// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2024 Haydn Paterson (sinclair) <haydn.developer@gmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { FormatRegistry, Type } from "@sinclair/typebox";
import {
  isStringEventID,
  isStringRoomAlias,
  isStringRoomID,
  isStringUserID,
  StringEventID,
  StringRoomAlias,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

FormatRegistry.Set("StringUserID", isStringUserID);

export const StringUserIDSchema = Type.Unsafe<StringUserID>(
  Type.String({ format: "StringUserID" })
);

FormatRegistry.Set("StringRoomID", isStringRoomID);

export const StringRoomIDSchema = Type.Unsafe<StringRoomID>(
  Type.String({ format: "StringRoomID" })
);

FormatRegistry.Set("StringRoomAlias", isStringRoomAlias);

export const StringRoomAliasSchema = Type.Unsafe<StringRoomAlias>(
  Type.String({ format: "StringRoomAlias" })
);

FormatRegistry.Set("StringEventID", isStringEventID);

export const StringEventIDSchema = Type.Unsafe<StringEventID>(
  Type.String({ format: "StringEventID" })
);
