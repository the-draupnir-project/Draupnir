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
import { DraupnirContext } from "./CommandHandler";
import { MatrixRoomID, MatrixRoomReference } from "./interface-manager/MatrixRoomReference";
import { CommandResult } from "./interface-manager/Validation";
import { CommandException, CommandExceptionKind } from "./interface-manager/CommandException";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { DocumentNode } from "./interface-manager/DeadDocument";
import { JSXFactory } from "./interface-manager/JSXFactory";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import { Permalinks } from "./interface-manager/Permalinks";

defineInterfaceCommand({
    table: "mjolnir",
    designator: ["rooms"],
    summary: "List all of the protected rooms.",
    parameters: parameters([]),
    command: async function (this: DraupnirContext, _keywrods): Promise<CommandResult<string[]>> {
        return CommandResult.Ok(this.mjolnir.protectedRoomsTracker.getProtectedRooms());
    }
})

function renderProtectedRooms(rooms: string[]): DocumentNode {
    return <root>
        <details>
            <summary><b>Protected Rooms ({rooms.length}):</b></summary>
            <ul>
                {rooms.map(r => <li><a href={Permalinks.forRoom(r)}>{r}</a></li>)}
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
    command: async function (this: DraupnirContext, _keywords, roomRef: MatrixRoomReference): Promise<CommandResult<void>> {
        const roomIDOrError = await (async () => {
            try {
                return CommandResult.Ok(await roomRef.joinClient(this.mjolnir.client));
            } catch (e) {
                return CommandException.Result<MatrixRoomID>(
                    `The homeserver that Draupnir is hosted on cannot join this room using the room reference provided.\
                    Try an alias or the "share room" button in your client to obtain a valid reference to the room.`,
                    { exception: e, exceptionKind: CommandExceptionKind.Unknown }
                );
            }
        })();
        if (roomIDOrError.isErr()) {
            return CommandResult.Err(roomIDOrError.err);
        }
        await this.mjolnir.addProtectedRoom(roomIDOrError.ok.toRoomIdOrAlias());
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
    command: async function (this: DraupnirContext, _keywords, roomRef: MatrixRoomReference): Promise<CommandResult<void>> {
        const roomID = await roomRef.resolve(this.mjolnir.client);
        await this.mjolnir.removeProtectedRoom(roomID.toRoomIdOrAlias());
        try {
            await this.mjolnir.client.leaveRoom(roomID.toRoomIdOrAlias());
        } catch (exception) {
            return CommandException.Result(
                `Failed to leave ${roomRef.toPermalink()} - the room is no longer being protected, but the bot could not leave.`,
                { exceptionKind: CommandExceptionKind.Unknown, exception }
            );
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
