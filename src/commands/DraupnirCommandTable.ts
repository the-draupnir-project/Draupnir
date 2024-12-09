// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import {
  StandardCommandTable,
  StringFromMatrixEventReferenceTranslator,
  StringFromMatrixRoomAliasTranslator,
  StringFromMatrixRoomIDTranslator,
  StringFromMatrixUserIDTranslator,
  StringFromNumberTranslator,
} from "@the-draupnir-project/interface-manager";

export const DraupnirTopLevelCommands = new StandardCommandTable(
  "draupnir top level"
)
  .internPresentationTypeTranslator(StringFromNumberTranslator)
  .internPresentationTypeTranslator(StringFromMatrixRoomIDTranslator)
  .internPresentationTypeTranslator(StringFromMatrixRoomAliasTranslator)
  .internPresentationTypeTranslator(StringFromMatrixUserIDTranslator)
  .internPresentationTypeTranslator(StringFromMatrixEventReferenceTranslator);
