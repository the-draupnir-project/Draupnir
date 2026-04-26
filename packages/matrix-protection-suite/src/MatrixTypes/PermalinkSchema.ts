// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { isError, Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import {
  MatrixEventReference,
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixRoomReference,
} from "@the-draupnir-project/matrix-basic-types";
import { EDStatic } from "../Interface/Static";

type PermalinkDecoder<T> = (string: string) => Result<T>;

function decodePermalink<T>(
  link: string,
  permalinkDecoder: PermalinkDecoder<T>
) {
  const permalinkResult = permalinkDecoder(link);
  if (isError(permalinkResult)) {
    throw new TypeError(permalinkResult.error.message);
  } else {
    return permalinkResult.ok;
  }
}

// It is important to guard the schema with this pattern in case it is used in a
// union later on.
const EventPermalinkSchemaRegex =
  /^https:\/\/matrix\.to\/#\/[^/?]+\/(?:\$|%24)/;
export const EventPermalinkSchema = Type.Transform(
  Type.String({ pattern: EventPermalinkSchemaRegex.source })
)
  .Decode((value) => decodePermalink(value, MatrixEventReference.fromPermalink))
  .Encode((value) => value.toPermalink());

export type EventPermalinkSchema = EDStatic<typeof EventPermalinkSchema>;

const RoomIDPermalinkSchemaRegex =
  /^https:\/\/matrix\.to\/#\/![^/?]+(?:\?.*)?$/;
export const RoomIDPermalinkSchema = Type.Transform(
  Type.String({ pattern: RoomIDPermalinkSchemaRegex.source })
)
  .Decode((value) => {
    const roomReference = decodePermalink(
      value,
      MatrixRoomReference.fromPermalink
    );
    if (roomReference instanceof MatrixRoomAlias) {
      throw new TypeError("Things are badly wrong");
    }
    return roomReference;
  })
  .Encode((value) => value.toPermalink());

export type RoomIDPermalinkSchema = EDStatic<typeof RoomIDPermalinkSchema>;

const RoomAliasPermalinkSchemaRegex =
  /^https:\/\/matrix\.to\/#\/(?:#|%23)[^/?]+$/;
export const RoomAliasPermalinkSchema = Type.Transform(
  Type.String({ pattern: RoomAliasPermalinkSchemaRegex.source })
)
  .Decode((value) => {
    const roomReference = decodePermalink(
      value,
      MatrixRoomReference.fromPermalink
    );
    if (roomReference instanceof MatrixRoomID) {
      throw new TypeError("Things are badly wrong");
    }
    return roomReference;
  })
  .Encode((value) => value.toPermalink());

export type RoomAliasPermalinkSchema = EDStatic<
  typeof RoomAliasPermalinkSchema
>;

export const RoomReferencePermalinkSchema = Type.Union([
  RoomIDPermalinkSchema,
  RoomAliasPermalinkSchema,
]);

export type RoomReferencePermalinkSchema = EDStatic<
  typeof RoomReferencePermalinkSchema
>;

export const PermalinkSchema = Type.Union([
  RoomIDPermalinkSchema,
  RoomAliasPermalinkSchema,
  EventPermalinkSchema,
]);

export type PermalinkSchema = EDStatic<typeof PermalinkSchema>;
