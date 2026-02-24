// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StaticEncode, Type } from "@sinclair/typebox";
import { describeConfig } from "../../Config/describeConfig";
import { StringRoomIDSchema } from "../../MatrixTypes/StringlyTypedMatrix";
import { EDStatic } from "../../Interface/Static";

export const MjolnirProtectedRoomsDescription = describeConfig({
  schema: Type.Object(
    {
      // does not have `uniqueItems: true` because there was as bug where
      // the management room kept on being added to the list of protected rooms.
      // deduplication is managed by the config implementation.
      // https://github.com/Gnuxie/matrix-protection-suite/blob/de249c4cb81290aa1081f440af16f0cadc3522d0/src/Protection/ProtectedRoomsConfig/ProtectedRoomsConfig.ts#L108
      rooms: Type.Array(StringRoomIDSchema, { default: [] }),
    },
    { title: "ProtectedRoomsConfig" }
  ),
});

export type MjolnirProtectedRoomsConfigEvent = EDStatic<
  typeof MjolnirProtectedRoomsDescription.schema
>;

export type MjolnirProtectedRoomsEncodedShape = StaticEncode<
  typeof MjolnirProtectedRoomsDescription.schema
>;
