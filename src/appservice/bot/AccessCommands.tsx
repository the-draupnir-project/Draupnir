/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { defineInterfaceCommand, findTableCommand } from "../../commands/interface-manager/InterfaceCommand";
import { findPresentationType, parameters, ParsedKeywords } from "../../commands/interface-manager/ParameterParsing";
import { CommandResult } from "../../commands/interface-manager/Validation";
import { AppserviceContext } from "./AppserviceCommandHandler";
import { UserID } from "matrix-bot-sdk";
import { defineMatrixInterfaceAdaptor } from "../../commands/interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "../../commands/interface-manager/MatrixHelpRenderer";

defineInterfaceCommand({
    designator: ["allow"],
    table: "appservice bot",
    parameters: parameters([
        {
            name: 'user',
            acceptor: findPresentationType('UserID'),
            description: 'The user that should be allowed to provision a bot'
        }
    ]),
    command: async function (this: AppserviceContext, _keywords: ParsedKeywords, user: UserID): Promise<CommandResult<void>> {
        await this.appservice.accessControl.allow(user.toString());
        return CommandResult.Ok(undefined);
    },
    summary: "Allow a user to provision themselves a draupnir using the appservice."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("appservice bot", "allow"),
    renderer: tickCrossRenderer,
});

defineInterfaceCommand({
    designator: ["remove"],
    table: "appservice bot",
    parameters: parameters([
        {
            name: 'user',
            acceptor: findPresentationType('UserID'),
            description: 'The user which shall not be allowed to provision bots anymore'
        }
    ]),
    command: async function (this: AppserviceContext, _keywords: ParsedKeywords, user: UserID): Promise<CommandResult<void>> {
        await this.appservice.accessControl.remove(user.toString());
        return CommandResult.Ok(undefined);
    },
    summary: "Stop a user from using any provisioned draupnir in the appservice."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("appservice bot", "remove"),
    renderer: tickCrossRenderer,
});
