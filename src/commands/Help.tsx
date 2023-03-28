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
import { CommandResult } from "./interface-manager/Validation";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";

const oldHelpMenu = "" +
"!mjolnir                                                            - Print status information\n" +
"!mjolnir status                                                     - Print status information\n" +
"!mjolnir status protection <protection> [subcommand]                - Print status information for a protection\n" +
"!mjolnir redact <user ID> [room alias/ID] [limit]                   - Redacts messages by the sender in the target room (or all rooms), up to a maximum number of events in the backlog (default 1000)\n" +
"!mjolnir redact <event permalink>                                   - Redacts a message by permalink\n" +
"!mjolnir kick <glob> [room alias/ID] [reason]                       - Kicks a user or all of those matching a glob in a particular room or all protected rooms\n" +
"!mjolnir sync                                                       - Force updates of all lists and re-apply rules\n" +
"!mjolnir verify                                                     - Ensures Mjolnir can moderate all your rooms\n" +
"!mjolnir list create <shortcode> <alias localpart>                  - Creates a new ban list with the given shortcode and alias\n" +
"!mjolnir import <room alias/ID> <list shortcode>                    - Imports bans and ACLs into the given list\n" +
"!mjolnir default <shortcode>                                        - Sets the default list for commands\n" +
"!mjolnir protections                                                - List all available protections\n" +
"!mjolnir enable <protection>                                        - Enables a particular protection\n" +
"!mjolnir disable <protection>                                       - Disables a particular protection\n" +
"!mjolnir config set <protection>.<setting> [value]                  - Change a protection setting\n" +
"!mjolnir config add <protection>.<setting> [value]                  - Add a value to a list protection setting\n" +
"!mjolnir config remove <protection>.<setting> [value]               - Remove a value from a list protection setting\n" +
"!mjolnir config get [protection]                                    - List protection settings\n" +
"!mjolnir rooms                                                      - Lists all the protected rooms\n" +
"!mjolnir rooms add <room alias/ID>                                  - Adds a protected room (may cause high server load)\n" +
"!mjolnir rooms remove <room alias/ID>                               - Removes a protected room\n" +
"!mjolnir resolve <room alias>                                       - Resolves a room alias to a room ID\n" +
"!mjolnir since <date>/<duration> <action> <limit> [rooms...] [reason] - Apply an action ('kick', 'ban', 'mute', 'unmute' or 'show') to all users who joined a room since <date>/<duration> (up to <limit> users)\n" +
"!mjolnir powerlevel <user ID> <power level> [room alias/ID]         - Sets the power level of the user in the specified room (or all protected rooms)\n" +
"!mjolnir help                                                       - This menu\n";

function renderTableHelp(table: CommandTable): DocumentNode {
    // FIXME: is it possible to force case of table names?
    return <fragment>
        <details>
            <summary><b>{table.name} commands:</b></summary>
            {table.getExportedCommands().map(renderCommandSummary)}
            {table.getImportedTables().map(renderTableHelp)}
        </details>
    </fragment>
}

function renderMjolnirHelp(mjolnirTable: CommandTable): DocumentNode {
    return <root>
        <details>
            <summary><b>Old Commands:</b></summary>
            <pre>{oldHelpMenu}</pre>
        </details>
        {renderTableHelp(mjolnirTable)}
    </root>
}

defineInterfaceCommand({
    parameters: parameters([], new RestDescription('command parts', findPresentationType("any"))),
    table: "mjolnir",
    command: async function() { return CommandResult.Ok(findCommandTable("mjolnir")) },
    designator: ["help"],
    summary: "Display this message"
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "help"),
    renderer: async function(client, commandRoomId, event, result) {
        if (result.isErr()) {
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
