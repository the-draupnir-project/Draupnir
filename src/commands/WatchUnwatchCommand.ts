/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019 The Matrix.org Foundation C.I.C.

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
import { findPresentationType, parameters, ParsedKeywords } from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { ActionResult, MatrixRoomReference, PropagationType, isError } from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

defineInterfaceCommand({
    table: "mjolnir",
    designator: ["watch"],
    summary: "Watches a list and applies the list's assocated policies to draupnir's protected rooms.",
    parameters: parameters([
        {
            name: 'list',
            acceptor: findPresentationType("MatrixRoomReference"),
        }
    ]),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords, policyRoomReference: MatrixRoomReference): Promise<ActionResult<void>> {
        const policyRoom = await resolveRoomReferenceSafe(this.client, policyRoomReference);
        if (isError(policyRoom)) {
            return policyRoom;
        }
        return await this.draupnir.protectedRoomsSet.issuerManager.watchList(PropagationType.Direct, policyRoom.ok, {});
    },
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "watch"),
    renderer: tickCrossRenderer,
})

defineInterfaceCommand({
    table: "mjolnir",
    designator: ["unwatch"],
    summary: "Unwatches a list and stops applying the list's assocated policies to draupnir's protected rooms.",
    parameters: parameters([
        {
            name: 'list',
            acceptor: findPresentationType("MatrixRoomReference"),
        }
    ]),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords, policyRoomReference: MatrixRoomReference): Promise<ActionResult<void>> {
        const policyRoom = await resolveRoomReferenceSafe(this.client, policyRoomReference);
        if (isError(policyRoom)) {
            return policyRoom;
        }
        return await this.draupnir.protectedRoomsSet.issuerManager.unwatchList(PropagationType.Direct, policyRoom.ok);
    },
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "unwatch"),
    renderer: tickCrossRenderer,
})
