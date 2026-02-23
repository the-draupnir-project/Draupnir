// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import {
  AppserviceAllowCommand,
  AppserviceRemoveCommand,
} from "./AccessCommands";
import { AppserviceBotCommands } from "./AppserviceBotCommandTable";
import { AppserviceBotHelpCommand } from "./AppserviceBotHelp";
import {
  AppserviceListUnstartedCommand,
  AppserviceRestartDraupnirCommand,
} from "./ListCommand";

AppserviceBotCommands.internCommand(AppserviceBotHelpCommand, ["admin", "help"])
  .internCommand(AppserviceAllowCommand, ["admin", "allow"])
  .internCommand(AppserviceRemoveCommand, ["admin", "remove"])
  .internCommand(AppserviceRestartDraupnirCommand, ["admin", "restart"])
  .internCommand(AppserviceListUnstartedCommand, [
    "admin",
    "list",
    "unstarted",
  ]);
