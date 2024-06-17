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

import { ActionResult, MatrixRoomAlias, MatrixRoomID, isError } from "matrix-protection-suite";
import { DraupnirContext } from "./CommandHandler";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { ParsedKeywords, findPresentationType, parameters } from "./interface-manager/ParameterParsing";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { renderRoomPill, tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import { DeadDocumentJSX } from "./interface-manager/JSXFactory";

async function resolveAliasCommand(
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    alias: MatrixRoomAlias
): Promise<ActionResult<MatrixRoomID>> {
    return await resolveRoomReferenceSafe(this.client, alias);
}

defineInterfaceCommand({
    table: "draupnir",
    designator: ["resolve"],
    parameters: parameters([{
        name: "alias",
        acceptor: findPresentationType("MatrixRoomAlias")
    }]),
    command: resolveAliasCommand,
    summary: "Resolve a room alias."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("draupnir", "resolve"),
    renderer: async function(this, client, commandRoomID, event, result: ActionResult<MatrixRoomID>) {
        if (isError(result)) {
            await tickCrossRenderer.call(this, client, commandRoomID, event, result);
            return;
        }
        await renderMatrixAndSend(
            <root><code>{result.ok.toRoomIDOrAlias()}</code> - {renderRoomPill(result.ok)}</root>,
            commandRoomID,
            event,
            client
        )
    }
})
