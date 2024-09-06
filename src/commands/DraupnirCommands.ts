// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { StandardCommandTable } from "@the-draupnir-project/interface-manager";
import { DraupnirResolveAliasCommand } from "./ResolveAlias";
import {
  DraupnirAliasMoveCommand,
  DraupnirAliasRemoveCommand,
} from "./AliasCommands";
import { DraupnirBanCommand } from "./Ban";
import { DraupnirListCreateCommand } from "./CreateBanListCommand";
import { SynapseAdminDeactivateCommand } from "./DeactivateCommand";
import { DraupnirHelpCommand } from "./Help";
import { SynapseAdminHijackRoomCommand } from "./HijackRoomCommand";
import { DraupnirImportCommand } from "./ImportCommand";
import { DraupnirKickCommand } from "./KickCommand";
import {
  DraupnirProtectionsConfigAddCommand,
  DraupnirProtectionsConfigSetCommand,
  DraupnirProtectionsDisableCommand,
  DraupnirProtectionsEnableCommand,
} from "./ProtectionsCommands";
import { DraupnirRedactCommand } from "./RedactCommand";
import {
  DraupnirListProtectedRoomsCommand,
  DraupnirRoomsAddCommand,
  DraupnirRoomsRemoveCommand,
} from "./Rooms";
import {
  DraupnirListRulesCommand,
  DraupnirRulesMatchingCommand,
} from "./Rules";
import { DraupnirDisplaynameCommand } from "./SetDisplayNameCommand";
import { DraupnirSetPowerLevelCommand } from "./SetPowerLevelCommand";
import { SynapseAdminShutdownRoomCommand } from "./ShutdownRoomCommand";
import { DraupnirStatusCommand } from "./StatusCommand";
import { DraupnirUnbanCommand } from "./Unban";
import {
  DraupnirUnwatchPolicyRoomCommand,
  DraupnirWatchPolicyRoomCommand,
} from "./WatchUnwatchCommand";
import { DraupnirTopLevelCommands } from "./DraupnirCommandTable";

// TODO: These commands should all be moved to subdirectories tbh and this
// should be split like an index file for each subdirectory.
export const SynapseAdminCommands = new StandardCommandTable("synapse admin")
  .internCommand(SynapseAdminDeactivateCommand, ["deactivate"])
  .internCommand(SynapseAdminHijackRoomCommand, ["hijack", "room"])
  .internCommand(SynapseAdminShutdownRoomCommand, ["shutdown", "room"]);

const DraupnirCommands = new StandardCommandTable("draupnir")
  .internCommand(DraupnirAliasMoveCommand, ["alias", "move"])
  .internCommand(DraupnirAliasRemoveCommand, ["alias", "remove"])
  .internCommand(DraupnirBanCommand, ["ban"])
  .internCommand(DraupnirListCreateCommand, ["list", "create"])
  .internCommand(DraupnirHelpCommand, ["help"])
  .internCommand(DraupnirImportCommand, ["import"])
  .internCommand(DraupnirKickCommand, ["kick"])
  .internCommand(DraupnirProtectionsEnableCommand, ["protections", "enable"])
  .internCommand(DraupnirProtectionsDisableCommand, ["protections", "disable"])
  .internCommand(DraupnirProtectionsConfigAddCommand, [
    "protections",
    "config",
    "add",
  ])
  .internCommand(DraupnirProtectionsConfigAddCommand, [
    "protections",
    "config",
    "remove",
  ])
  .internCommand(DraupnirProtectionsConfigSetCommand, [
    "protections",
    "config",
    "set",
  ])
  .internCommand(DraupnirRedactCommand, ["redact"])
  .internCommand(DraupnirResolveAliasCommand, ["resolve"])
  .internCommand(DraupnirListProtectedRoomsCommand, ["rooms"])
  .internCommand(DraupnirRoomsAddCommand, ["rooms", "add"])
  .internCommand(DraupnirRoomsRemoveCommand, ["rooms", "remove"])
  .internCommand(DraupnirListRulesCommand, ["rules"])
  .internCommand(DraupnirRulesMatchingCommand, ["rules", "matching"])
  .internCommand(DraupnirDisplaynameCommand, ["displayname"])
  .internCommand(DraupnirSetPowerLevelCommand, ["powerlevel"])
  .internCommand(DraupnirStatusCommand, ["status"])
  .internCommand(DraupnirUnbanCommand, ["unban"])
  .internCommand(DraupnirWatchPolicyRoomCommand, ["watch"])
  .internCommand(DraupnirUnwatchPolicyRoomCommand, ["unwatch"]);

DraupnirCommands.importTable(SynapseAdminCommands, []);
DraupnirTopLevelCommands.importTable(DraupnirCommands, ["draupnir"]);
