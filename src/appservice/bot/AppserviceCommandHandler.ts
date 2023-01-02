/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { WeakEvent } from 'matrix-appservice-bridge';
import { readCommand } from '../../commands/interface-manager/CommandReader';
import { defineCommandTable, defineInterfaceCommand, findCommandTable } from '../../commands/interface-manager/InterfaceCommand';
import { defineMatrixInterfaceAdaptor, findMatrixInterfaceAdaptor, MatrixContext } from '../../commands/interface-manager/MatrixInterfaceAdaptor';
import { ArgumentStream, paramaters } from '../../commands/interface-manager/ParamaterParsing';
import { MjolnirAppService } from '../AppService';
import { CommandResult } from '../../commands/interface-manager/Validation';
import { renderHelp } from '../../commands/interface-manager/MatrixHelpRenderer';

defineCommandTable("appservice bot");

export interface AppserviceContext extends MatrixContext {
    appservice: MjolnirAppService;
}

export type AppserviceBaseExecutor = (this: AppserviceContext, ...args: any[]) => Promise<CommandResult<any>>;

import '../../commands/interface-manager/MatrixPresentations';
import './ListCommand';


const helpCommand = defineInterfaceCommand({
    paramaters: paramaters([]),
    table: "appservice bot",
    command: async function() { return CommandResult.Ok(findCommandTable("appservice bot").getCommands()) },
    designator: ["help"],
    summary: "Display this message"
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: helpCommand,
    renderer: renderHelp
})

export class AppserviceCommandHandler {
    private readonly commandTable = findCommandTable("appservice bot");

    constructor (
        private readonly appservice: MjolnirAppService
    ) {

    }

    public handleEvent(mxEvent: WeakEvent): void {
        if (mxEvent.type !== 'm.room.message' && mxEvent.room_id !== this.appservice.config.adminRoom) {
            return;
        }
        const body = typeof mxEvent.content['body'] === 'string' ? mxEvent.content['body'] : '';
        if (body.startsWith(this.appservice.bridge.getBot().getUserId())) {
            const readItems = readCommand(body).slice(1); // remove "!mjolnir"
            const argumentStream = new ArgumentStream(readItems);
            const command = this.commandTable.findAMatchingCommand(argumentStream);
            // FIXME: what if there's no command, print help?
            if (command) {
                const adaptor = findMatrixInterfaceAdaptor(command);
                const context: AppserviceContext = {
                    appservice: this.appservice,
                    roomId: mxEvent.room_id,
                    event: mxEvent,
                    client: this.appservice.bridge.getBot().getClient()
                };
                adaptor.invoke(context, context, ...argumentStream.rest());
                return;
            }
        }
    }
}
