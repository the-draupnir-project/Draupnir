/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2020-2021 The Matrix.org Foundation C.I.C.

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

import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, parameters } from "./interface-manager/ParameterParsing";
import { MjolnirContext } from "./CommandHandler";
import { MatrixRoomReference } from "./interface-manager/MatrixRoomReference";
import { CommandResult } from "./interface-manager/Validation";
import { CommandException } from "./interface-manager/CommandException";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { DocumentNode } from "./interface-manager/DeadDocument";
import { JSXFactory } from "./interface-manager/JSXFactory";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";

defineInterfaceCommand({
    table: "mjolnir",
    designator: ["rooms"],
    summary: "List all of the protected rooms.",
    parameters: parameters([]),
    command: async function (this: MjolnirContext, _keywrods): Promise<CommandResult<string[]>> {
        return CommandResult.Ok(this.mjolnir.protectedRoomsTracker.getProtectedRooms());
    }
})

// we reall need room references, not this bullshit.
function renderProtectedRooms(rooms: string[]): DocumentNode {
    return <root>
        <details>
            <summary><b>Protected Rooms:</b></summary>
            <ul>
                {rooms.map(r => <li>{r}</li>)}
            </ul>
        </details>
    </root>
}

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "rooms"),
    renderer: async function (client, commandRoomId, event, result) {
        tickCrossRenderer.call(this, ...arguments);
        if (result.isErr()) {
            return; // tickCrossRenderer will handle it.
        }
        await renderMatrixAndSend(
            renderProtectedRooms(result.ok),
            commandRoomId, event, client
        );
    }
})

defineInterfaceCommand({
    table: "mjolnir",
    designator: ["rooms", "add"],
    summary: "Protect the room using the watched policy lists, banning users and synchronizing server ACL.",
    parameters: parameters([
        {
            name: 'room',
            acceptor: findPresentationType("MatrixRoomReference"),
            description: 'The room to protect.'
        }
    ]),
    command: async function (this: MjolnirContext, _keywords, roomRef: MatrixRoomReference): Promise<CommandResult<void>> {
        const roomID = await roomRef.resolve(this.mjolnir.client);
        // change this ASAP to accept MatrixRoomReference, but it should still be resolved within the command
        // and kept as a reference.
        await this.mjolnir.addProtectedRoom(roomID.toRoomIdOrAlias());
        return CommandResult.Ok(undefined);
    },
})

defineInterfaceCommand({
    table: "mjolnir",
    designator: ["rooms", "remove"],
    summary: "Stop protecting the room and leave.",
    parameters: parameters([
        {
            name: 'room',
            acceptor: findPresentationType("MatrixRoomReference"),
            description: 'The room to stop protecting.'
        }
    ]),
    command: async function (this: MjolnirContext, _keywords, roomRef: MatrixRoomReference): Promise<CommandResult<void>> {
        const roomID = await roomRef.resolve(this.mjolnir.client);
        try {
            await this.mjolnir.client.leaveRoom(roomID.toRoomIdOrAlias());
        } catch (exception) {
            // TODO find out whether CommandResult.Error is logges somewhere, so that we do not have to anymore.
            return CommandException.Result(`Failed to leave ${roomRef.toPermalink()} - the room is no longer being protected, but the bot could not leave.`, { exception });
        }
        return CommandResult.Ok(undefined);
    },
})

for (const designator of [["rooms", "add"], ["rooms", "remove"]]) {
    defineMatrixInterfaceAdaptor({
        interfaceCommand: findTableCommand("mjolnir", ...designator),
        renderer: tickCrossRenderer,
    })
}

// FIXME:
// Mon, 29 May 2023 12:38:06 GMT [INFO] [MatrixInterfaceCommand] User input validation error when parsing command ["rooms","remove"]: Failed to leave https://matrix.to/#/!OxUALFPbSObCnVrRwa%3Alocalhost%3A9999 - the room is no longer being protected, but the bot could not leave.
// but says this in the room:
// There was an unexpected error when processing this command:
//Failed to leave f - the room is no longer being protected, but the bot could not leave.
//Details can be found by providing the reference 104a246a-b270-4fc3-a416-174b42a5f172to an administrator.
// clearly it should also print that reference and the error in the log - and it isn't a validation error lol.
