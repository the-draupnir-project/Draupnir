/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2020 The Matrix.org Foundation C.I.C.

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
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { MjolnirContext } from "./CommandHandler";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { parameters, findPresentationType, ParsedKeywords } from "./interface-manager/ParameterParsing";
import { CommandResult, CommandError } from "./interface-manager/Validation";
import { MatrixRoomReference } from "./interface-manager/MatrixRoomReference";

async function addRemoveFromDirectory(mjolnir: Mjolnir, roomRef: MatrixRoomReference, visibility: "public" | "private"): Promise<CommandResult<void>> {
    const isAdmin = await mjolnir.isSynapseAdmin();
    if (!isAdmin) {
        return CommandError.Result('I am not a Synapse administrator, or the endpoint to remove/add to the room directory is blocked');
    }
    const targetRoomId = (await roomRef.resolve(mjolnir.client)).toRoomIdOrAlias();
    await mjolnir.client.setDirectoryVisibility(targetRoomId, visibility);
    return CommandResult.Ok(undefined);
}

// Note: While synapse admin API is not required for these endpoints,
// I believe they were added to manage rooms other than the ones you are admin in.
defineInterfaceCommand({
    table: "synapse admin",
    designator: ["directory", "add"],
    summary: "Publishes a room in the server's room directory.",
    parameters: parameters([
        {
            name: 'room',
            acceptor: findPresentationType("MatrixRoomReference"),
        }
    ]),
    command: async function (this: MjolnirContext, _keywords: ParsedKeywords, targetRoom: MatrixRoomReference): Promise<CommandResult<void, CommandError>> {
        return await addRemoveFromDirectory(this.mjolnir, targetRoom, "public");
    },
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("synapse admin", "directory", "add"),
    renderer: tickCrossRenderer,
})

defineInterfaceCommand({
    table: "synapse admin",
    designator: ["directory", "remove"],
    summary: "Removes a room from the server's room directory.",
    parameters: parameters([
        {
            name: 'room',
            acceptor: findPresentationType("MatrixRoomReference"),
        }
    ]),
    command: async function (this: MjolnirContext, _keywords: ParsedKeywords, targetRoom: MatrixRoomReference): Promise<CommandResult<void, CommandError>> {
        return await addRemoveFromDirectory(this.mjolnir, targetRoom, "private");
    },
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("synapse admin", "directory", "remove"),
    renderer: tickCrossRenderer,
})
