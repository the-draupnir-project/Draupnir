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

import { DocumentNode } from "./interface-manager/DeadDocument";
import { CommandTable, defineInterfaceCommand, findCommandTable, findTableCommand } from "./interface-manager/InterfaceCommand";
import { renderCommandSummary } from "./interface-manager/MatrixHelpRenderer";
import { JSXFactory } from "./interface-manager/JSXFactory";
import { findPresentationType, parameters, RestDescription } from "./interface-manager/ParameterParsing";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import { ActionResult, Ok, isError } from "matrix-protection-suite";
import { DOCUMENTATION_URL } from "../config";

function renderTableHelp(table: CommandTable): DocumentNode {
    // FIXME: is it possible to force case of table names?
    return <fragment>
        <b>Documentation: </b> <a href={DOCUMENTATION_URL}>{DOCUMENTATION_URL}</a><br/>
        <details>
            <summary><b>{table.name} commands:</b></summary>
            {table.getExportedCommands().map(renderCommandSummary)}
            {table.getImportedTables().map(renderTableHelp)}
        </details>
    </fragment>
}

function renderMjolnirHelp(mjolnirTable: CommandTable): DocumentNode {
    return <root>
        {renderTableHelp(mjolnirTable)}
    </root>
}

defineInterfaceCommand({
    parameters: parameters([], new RestDescription('command parts', findPresentationType("any"))),
    table: "draupnir",
    command: async function() {
        return Ok(findCommandTable("draupnir"))
    },
    designator: ["help"],
    summary: "Display this message"
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("draupnir", "help"),
    renderer: async function(client, commandRoomId, event, result: ActionResult<CommandTable>) {
        if (isError(result)) {
            throw new TypeError("This command isn't supposed to fail");
        }
        await renderMatrixAndSend(
            renderMjolnirHelp(result.ok),
            commandRoomId,
            event,
            client
        );
    }
})

// how to catagorise commands in help?
// one way is to have subcommand tables to group them by and then iterate over the subcommand tables
// what happens to the method that gets all the command in a table flat though?
// i guess there needs to be immediate commands and imported commands
// then we need to figure out how to render documentation, do we want to write that
// in markdown and import it or something? Not sure.
// but we need this because mjolnir-for-all etc.

// alternatively we could just render the help page ourselves
// putting each category out by hand.

// another thing to imagine is if you wanted to generate a link to a page
// where you can browse the documentation.
