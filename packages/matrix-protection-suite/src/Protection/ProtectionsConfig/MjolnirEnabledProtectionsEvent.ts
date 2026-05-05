// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { StaticDecode, Type } from "@sinclair/typebox";
import { Value } from "../../Interface/Value";
import { StateEvent } from "../../MatrixTypes/Events";
import { DRAUPNIR_SCHEMA_VERSION_KEY } from "../../Interface/SchemedMatrixData";
import { EDStatic } from "../../Interface/Static";

export type MjolnirEnabledProtectionsEvent = StaticDecode<
  typeof MjolnirEnabledProtectionsEvent
>;
export const MjolnirEnabledProtectionsEvent = Type.Object({
  enabled: Type.Array(Type.String()),
  [DRAUPNIR_SCHEMA_VERSION_KEY]: Type.Optional(Type.Number()),
});
Value.Compile(MjolnirEnabledProtectionsEvent);

export const MjolnirEnabledProtectionsEventType =
  "org.matrix.mjolnir.enabled_protections";

export const MjolnirProtectionSettingsEventType = "org.matrix.mjolnir.setting";

export type MjolnirProtectionSettingsEventContent = EDStatic<
  typeof MjolnirProtectionSettingsEventContent
>;

export const MjolnirProtectionSettingsEventContent = Type.Record(
  Type.String(),
  Type.Unknown()
);

export type MjolnirProtectionSettingsEvent = EDStatic<
  typeof MjolnirProtectionSettingsEvent
>;

export const MjolnirProtectionSettingsEvent = Type.Intersect([
  Type.Omit(StateEvent(MjolnirProtectionSettingsEventContent), ["type"]),
  Type.Object({
    type: Type.Literal(MjolnirProtectionSettingsEventType),
  }),
]);
