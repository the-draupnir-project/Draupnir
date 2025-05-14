// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  StandardCommandTable,
  StringfromBooleanTranslator,
  StringFromMatrixEventReferenceTranslator,
  StringFromMatrixRoomAliasTranslator,
  StringFromMatrixRoomIDTranslator,
  StringFromMatrixUserIDTranslator,
  StringFromNumberTranslator,
} from "@the-draupnir-project/interface-manager";
import { SafeModeHelpCommand } from "./HelpCommand";
import { SafeModeStatusCommand } from "./StatusCommand";
import { SafeModeRestartCommand } from "./RestartDraupnirCommand";
import { SafeModeRecoverCommand } from "./RecoverCommand";

export const SafeModeCommands = new StandardCommandTable("safe mode")
  .internPresentationTypeTranslator(StringFromNumberTranslator)
  .internPresentationTypeTranslator(StringfromBooleanTranslator)
  .internPresentationTypeTranslator(StringFromMatrixRoomIDTranslator)
  .internPresentationTypeTranslator(StringFromMatrixRoomAliasTranslator)
  .internPresentationTypeTranslator(StringFromMatrixUserIDTranslator)
  .internPresentationTypeTranslator(StringFromMatrixEventReferenceTranslator)
  .internCommand(SafeModeHelpCommand, ["draupnir", "help"])
  .internCommand(SafeModeStatusCommand, ["draupnir", "status"])
  .internCommand(SafeModeRecoverCommand, ["draupnir", "recover"])
  .internCommand(SafeModeRestartCommand, ["draupnir", "restart"]);
