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

import { UserID } from "matrix-bot-sdk";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, parameters, ParsedKeywords } from "./interface-manager/ParameterParsing";
import { MjolnirContext } from "./CommandHandler";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { CommandResult, CommandError } from "./interface-manager/Validation";

defineInterfaceCommand({
    table: "synapse admin",
    designator: ["deactivate"],
    summary: "Deactivates the user on the homeserver, preventing use of the account.",
    parameters: parameters([
        {
            name: 'user',
            acceptor: findPresentationType("UserID"),
        }
    ]),
    command: async function (this: MjolnirContext, _keywords: ParsedKeywords, targetUser: UserID): Promise<CommandResult<void, CommandError>> {
        const isAdmin = await this.mjolnir.isSynapseAdmin();
        if (!isAdmin) {
            return CommandError.Result('I am not a Synapse administrator, or the endpoint to deactivate a user is blocked');
        }
        await this.mjolnir.shutdownSynapseRoom(targetUser.toString());
        return CommandResult.Ok(undefined);
    },
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("synapse admin", "deactivate"),
    renderer: tickCrossRenderer,
})
