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

import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, parameters, ParsedKeywords, RestDescription } from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { ActionError, ActionResult, MatrixRoomReference, Ok, isError } from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

defineInterfaceCommand({
    table: "synapse admin",
    designator: ["shutdown", "room"],
    summary: "Prevents access to the the room on this server and sends a message to all users that they have violated the terms of service.",
    parameters: parameters([
        {
            name: 'room',
            acceptor: findPresentationType("MatrixRoomReference"),
        },
    ],
    new RestDescription("reason", findPresentationType("string"))),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords, targetRoom: MatrixRoomReference, ...reasonParts: string[]): Promise<ActionResult<void>> {
        const isAdmin = await this.draupnir.synapseAdminClient?.isSynapseAdmin();
        if (isAdmin === undefined || isError(isAdmin) || !isAdmin.ok) {
            return ActionError.Result('I am not a Synapse administrator, or the endpoint to shutdown a room is blocked');
        }
        if (this.draupnir.synapseAdminClient === undefined) {
            throw new TypeError(`Should be impossible at this point.`);
        }
        const resolvedRoom = await resolveRoomReferenceSafe(this.client, targetRoom);
        if (isError(resolvedRoom)) {
            return resolvedRoom;
        }
        const reason = reasonParts.join(" ");
        await this.draupnir.synapseAdminClient.deleteRoom(
            resolvedRoom.ok.toRoomIDOrAlias(),
            {
                message: reason,
                new_room_user_id: this.draupnir.clientUserID,
                block: true,
            }

        );
        return Ok(undefined);
    },
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("synapse admin", "shutdown", "room"),
    renderer: tickCrossRenderer,
})
