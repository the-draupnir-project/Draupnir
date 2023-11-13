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
import { execKickCommand } from "./KickCommand";
import { parse as tokenize } from "shell-quote";
import { execSinceCommand } from "./SinceCommand";
import { readCommand } from "./interface-manager/CommandReader";
import { BaseFunction, CommandTable, defineCommandTable, findCommandTable, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findMatrixInterfaceAdaptor, MatrixContext } from "./interface-manager/MatrixInterfaceAdaptor";
import { ArgumentStream } from "./interface-manager/ParameterParsing";
import { CommandResult } from "./interface-manager/Validation";
import { CommandException, CommandExceptionKind } from "./interface-manager/CommandException";
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
import "./SetDisplayNameCommand";
import { RoomMessage, StringRoomID } from "matrix-protection-suite";

export const COMMAND_PREFIX = "!mjolnir";

export async function handleCommand(
    roomID: StringRoomID,
    event: RoomMessage,
    normalisedCommand: string,
    mjolnir: Mjolnir,
    commandTable: CommandTable<BaseFunction>
) {
    const parts = normalisedCommand.trim().split(' ').filter(p => p.trim().length > 0);

    // A shell-style parser that can parse `"a b c"` (with quotes) as a single argument.
    // We do **not** want to parse `#` as a comment start, though.
    const tokens = tokenize(normalisedCommand.replace("#", "\\#")).slice(/* get rid of ["!mjolnir", command] */ 2);

    try {
        if (parts[1] === 'joins') {
            return await showJoinsStatus(roomID, event, mjolnir, parts.slice(/* ["joins"] */ 2));
        } else if (parts[1] === 'sync') {
            return await execSyncCommand(roomID, event, mjolnir);
        } else if (parts[1] === 'verify') {
            return await execPermissionCheckCommand(roomID, event, mjolnir);
        } else if (parts.length >= 5 && parts[1] === 'list' && parts[2] === 'create') {
            return await execCreateListCommand(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'redact' && parts.length > 1) {
            return await execRedactCommand(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'import' && parts.length > 2) {
            return await execImportCommand(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'default' && parts.length > 2) {
            return await execSetDefaultListCommand(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'protections') {
            return await execListProtections(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'enable' && parts.length > 1) {
            return await execEnableProtection(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'disable' && parts.length > 1) {
            return await execDisableProtection(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'config' && parts[2] === 'set' && parts.length > 3) {
            return await execConfigSetProtection(roomID, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'config' && parts[2] === 'add' && parts.length > 3) {
            return await execConfigAddProtection(roomID, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'config' && parts[2] === 'remove' && parts.length > 3) {
            return await execConfigRemoveProtection(roomID, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'config' && parts[2] === 'get') {
            return await execConfigGetProtection(roomID, event, mjolnir, parts.slice(3))
        } else if (parts[1] === 'resolve' && parts.length > 2) {
            return await execResolveCommand(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'powerlevel' && parts.length > 3) {
            return await execSetPowerLevelCommand(roomID, event, mjolnir, parts);
        } else if (parts[1] === 'since') {
            return await execSinceCommand(roomID, event, mjolnir, tokens);
        } else if (parts[1] === 'kick' && parts.length > 2) {
            return await execKickCommand(roomID, event, mjolnir, parts);
        } else {
            const readItems = readCommand(normalisedCommand).slice(1); // remove "!mjolnir"
            const stream = new ArgumentStream(readItems);
            const command = commandTable.findAMatchingCommand(stream)
                ?? findTableCommand("mjolnir", "help");
            const adaptor = findMatrixInterfaceAdaptor(command);
            const mjolnirContext: MjolnirContext = {
                mjolnir, roomId: roomID, event, client: mjolnir.client, emitter: mjolnir.matrixEmitter,
            };
            try {
                return await adaptor.invoke(mjolnirContext, mjolnirContext, ...stream.rest());
            } catch (e) {
                const commandError = new CommandException(CommandExceptionKind.Unknown, e, 'Unknown Unexpected Error');
                await tickCrossRenderer.call(mjolnirContext, mjolnir.client, roomID, event, CommandResult.Err(commandError));
            }
        }
    } catch (e) {
        LogService.error("CommandHandler", e);
        const text = "There was an error processing your command - see console/log for details";
        const reply = RichReply.createFor(roomID, event, text, text);
        reply["msgtype"] = "m.notice";
        return await mjolnir.client.sendMessage(roomID, reply);
    }
}

export function extractCommandFromMessageBody(
    body: string,
    { prefix,
      localpart,
      displayName,
      userId,
      additionalPrefixes,
      allowNoPrefix
    }: {
        prefix: string,
        localpart: string,
        displayName: string,
        userId: string,
        additionalPrefixes: string[],
        allowNoPrefix: boolean
}): string | undefined {
    const plainPrefixes = [prefix, localpart, displayName, userId, ...additionalPrefixes];
    const allPossiblePrefixes = [
        ...plainPrefixes.map(p => `!${p}`),
        ...plainPrefixes.map(p => `${p}:`),
        ...plainPrefixes,
        ...allowNoPrefix ? ['!'] : [],
    ];
    const usedPrefixInMessage = allPossiblePrefixes.find(p => body.toLowerCase().startsWith(p.toLowerCase()));
    if (usedPrefixInMessage === undefined) {
        return;
    }
    // normalise the event body to make the prefix uniform (in case the bot has spaces in its display name)
    const restOfBody = body.substring(usedPrefixInMessage.length);
    return prefix + restOfBody.startsWith(' ') ? restOfBody : ` ${restOfBody}`;
}
