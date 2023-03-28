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
import { MjolnirContext } from "./CommandHandler";
import { MatrixRoomReference } from "./interface-manager/MatrixRoomReference";
import { CommandError, CommandResult } from "./interface-manager/Validation";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";

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
    command: async function (this: MjolnirContext, _keywords: ParsedKeywords, list: MatrixRoomReference): Promise<CommandResult<void, CommandError>> {
        await this.mjolnir.policyListManager.watchList(list);
        return CommandResult.Ok(undefined);
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
    command: async function (this: MjolnirContext, _keywords: ParsedKeywords, list: MatrixRoomReference): Promise<CommandResult<void, CommandError>> {
        await this.mjolnir.policyListManager.unwatchList(list);
        return CommandResult.Ok(undefined);
    },
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "unwatch"),
    renderer: tickCrossRenderer,
})
