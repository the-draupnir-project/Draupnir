// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StaticEncode, Type } from "@sinclair/typebox";
import { describeConfig } from "../../Config/describeConfig";
import { EDStatic } from "../../Interface/Static";
import { DRAUPNIR_SCHEMA_VERSION_KEY } from "../../Interface/SchemedMatrixData";

export const MjolnirEnabledProtectionsDescription = describeConfig({
  schema: Type.Object(
    {
      enabled: Type.Array(Type.String(), { default: [], uniqueItems: true }),
      [DRAUPNIR_SCHEMA_VERSION_KEY]: Type.Optional(Type.Number()),
    },
    { title: "EnabledProtectionsConfig" }
  ),
});

export type MjolnirEnabledProtectionsDescriptionEvent = EDStatic<
  typeof MjolnirEnabledProtectionsDescription.schema
>;

export type MjolnirEnabledProtectionsEncodedShape = StaticEncode<
  typeof MjolnirEnabledProtectionsDescription.schema
>;
