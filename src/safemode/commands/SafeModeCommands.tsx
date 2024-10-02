// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StandardCommandTable } from "@the-draupnir-project/interface-manager";
import { SafeModeHelpCommand } from "./HelpCommand";
import { SafeModeStatusCommand } from "./StatusCommand";
import { SafeModeRestartCommand } from "./RestartDraupnirCommand";
import { SafeModeRecoverCommand } from "./RecoverCommand";

export const SafeModeCommands = new StandardCommandTable("safe mode")
  .internCommand(SafeModeHelpCommand, ["draupnir", "help"])
  .internCommand(SafeModeStatusCommand, ["draupnir", "status"])
  .internCommand(SafeModeRecoverCommand, ["draupnir", "recover"])
  .internCommand(SafeModeRestartCommand, ["draupnir", "restart"]);
