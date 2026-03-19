// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StaticEncode, Type } from "@sinclair/typebox";
import { describeConfig } from "../../Config/describeConfig";
import { RoomReferencePermalinkSchema } from "../../MatrixTypes/PermalinkSchema";
import { EDStatic } from "../../Interface/Static";

export const MjolnirPolicyRoomsDescription = describeConfig({
  schema: Type.Object(
    {
      references: Type.Array(RoomReferencePermalinkSchema, {
        default: [],
        uniqueItems: true,
      }),
    },
    { title: "PolicyRoomsConfig" }
  ),
});

export type MjolnirPolicyRoomsDescriptionEvent = EDStatic<
  typeof MjolnirPolicyRoomsDescription.schema
>;

export type MjolnirPolicyRoomsEncodedShape = StaticEncode<
  typeof MjolnirPolicyRoomsDescription.schema
>;
