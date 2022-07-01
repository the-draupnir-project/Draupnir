/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { Mjolnir } from "../Mjolnir";
import { showJoinsStatus } from "./JoinsCommand";
import { LogService, RichReply } from "matrix-bot-sdk";
import { execSyncCommand } from "./SyncCommand";
import { execPermissionCheckCommand } from "./PermissionCheckCommand";
import { execCreateListCommand } from "./CreateBanListCommand";
import { execRedactCommand } from "./RedactCommand";
import { execImportCommand } from "./ImportCommand";
import { execSetDefaultListCommand } from "./SetDefaultBanListCommand";
import {
    execDisableProtection, execEnableProtection, execListProtections, execConfigGetProtection,
    execConfigSetProtection, execConfigAddProtection, execConfigRemoveProtection
} from "./ProtectionsCommands";
import { execSetPowerLevelCommand } from "./SetPowerLevelCommand";
import { execResolveCommand } from "./ResolveAlias";
import { execKickCommand, execServerAclCleanCommand } from "./KickCommand";
import { parse as tokenize } from "shell-quote";
import { execSinceCommand } from "./SinceCommand";
import { readCommand } from "./interface-manager/CommandReader";
import { BaseFunction, CommandTable, defineCommandTable, findCommandTable, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findMatrixInterfaceAdaptor, MatrixContext } from "./interface-manager/MatrixInterfaceAdaptor";
import { ArgumentStream } from "./interface-manager/ParameterParsing";
import { CommandResult } from "./interface-manager/Validation";
import { CommandException } from "./interface-manager/CommandException";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import "./interface-manager/MatrixPresentations";

export interface MjolnirContext extends MatrixContext {
    mjolnir: Mjolnir,
}

export type MjolnirBaseExecutor = (this: MjolnirContext, ...args: any[]) => Promise<CommandResult<any>>;

defineCommandTable("synapse admin");
import "./HijackRoomCommand";
import "./ShutdownRoomCommand";
import "./DeactivateCommand";
import "./AliasCommands";

defineCommandTable("mjolnir").importTable(findCommandTable("synapse admin"));
import "./Ban";
import "./Unban";
import "./StatusCommand";
import "./Rooms";
import "./Rules";
import "./WatchUnwatchCommand";
import "./Help";

export const COMMAND_PREFIX = "!mjolnir";

export async function handleCommand(roomId: string, event: { content: { body: string } }, mjolnir: Mjolnir, commandTable: CommandTable<BaseFunction>) {
    const cmd = event['content']['body'];
    const parts = cmd.trim().split(' ').filter(p => p.trim().length > 0);

    // A shell-style parser that can parse `"a b c"` (with quotes) as a single argument.
    // We do **not** want to parse `#` as a comment start, though.
    const tokens = tokenize(cmd.replace("#", "\\#")).slice(/* get rid of ["!mjolnir", command] */ 2);

    try {
        if (parts[1] === 'joins') {
            return await showJoinsStatus(roomId, event, mjolnir, parts.slice(/* ["joins"] */ 2));
        } else if (parts[1] === 'sync') {
            return await execSyncCommand(roomId, event, mjolnir);
        } else if (parts[1] === 'verify') {
            return await execPermissionCheckCommand(roomId, event, mjolnir);
        } else if (parts.length >= 5 && parts[1] === 'list' && parts[2] === 'create') {
            return await execCreateListCommand(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'redact' && parts.length > 1) {
            return await execRedactCommand(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'import' && parts.length > 2) {
            return await execImportCommand(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'default' && parts.length > 2) {
            return await execSetDefaultListCommand(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'protections') {
            return await execListProtections(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'enable' && parts.length > 1) {
            return await execEnableProtection(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'disable' && parts.length > 1) {
            return await execDisableProtection(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'config' && parts[2] === 'set' && parts.length > 3) {
            return await execConfigSetProtection(roomId, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'config' && parts[2] === 'add' && parts.length > 3) {
            return await execConfigAddProtection(roomId, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'config' && parts[2] === 'remove' && parts.length > 3) {
            return await execConfigRemoveProtection(roomId, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'config' && parts[2] === 'get') {
            return await execConfigGetProtection(roomId, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'resolve' && parts.length > 2) {
            return await execResolveCommand(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'powerlevel' && parts.length > 3) {
            return await execSetPowerLevelCommand(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'since') {
            return await execSinceCommand(roomId, event, mjolnir, tokens);
        } else if (parts[1] === 'kick' && parts.length > 2) {
            return await execKickCommand(roomId, event, mjolnir, parts);
        } else if (parts[1] === 'acl-clean') {
            return await execServerAclCleanCommand(roomId, event, mjolnir, parts);
        } else {
            const readItems = readCommand(cmd).slice(1); // remove "!mjolnir"
            const stream = new ArgumentStream(readItems);
            const command = commandTable.findAMatchingCommand(stream)
            ?? findTableCommand("mjolnir", "help");
            const adaptor = findMatrixInterfaceAdaptor(command);
            const mjolnirContext: MjolnirContext = {
                mjolnir, roomId, event, client: mjolnir.client, emitter: mjolnir.matrixEmitter,
            };
            try {
                return await adaptor.invoke(mjolnirContext, mjolnirContext, ...stream.rest());
            } catch (e) {
                const commandError = new CommandException(e, 'Unknown Unexpected Error');
                await tickCrossRenderer.call(mjolnirContext, mjolnir.client, roomId, event, CommandResult.Err(commandError));
            }
        }
    } catch (e) {
        LogService.error("CommandHandler", e);
        const text = "There was an error processing your command - see console/log for details";
        const reply = RichReply.createFor(roomId, event, text, text);
        reply["msgtype"] = "m.notice";
        return await mjolnir.client.sendMessage(roomId, reply);
    }
}
