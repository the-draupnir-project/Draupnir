/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { WeakEvent } from 'matrix-appservice-bridge';
import { readCommand } from '../../commands/interface-manager/CommandReader';
import { defineCommandTable, defineInterfaceCommand, findCommandTable, findTableCommand } from '../../commands/interface-manager/InterfaceCommand';
import { defineMatrixInterfaceAdaptor, findMatrixInterfaceAdaptor, MatrixContext } from '../../commands/interface-manager/MatrixInterfaceAdaptor';
import { ArgumentStream, RestDescription, findPresentationType, parameters } from '../../commands/interface-manager/ParameterParsing';
import { MjolnirAppService } from '../AppService';
import { renderHelp } from '../../commands/interface-manager/MatrixHelpRenderer';
import { AppserviceBotEmitter } from './AppserviceBotEmitter';
import { ActionResult, Ok, RoomMessage, Value, isError } from 'matrix-protection-suite';

defineCommandTable("appservice bot");

export interface AppserviceContext extends MatrixContext {
    appservice: MjolnirAppService;
}

export type AppserviceBaseExecutor = (this: AppserviceContext, ...args: unknown[]) => Promise<ActionResult<unknown>>;

import '../../commands/interface-manager/MatrixPresentations';
import './ListCommand';
import './AccessCommands';



defineInterfaceCommand({
    parameters: parameters([], new RestDescription('command parts', findPresentationType("any"))),
    table: "appservice bot",
    command: async function () {
        return Ok(findCommandTable("appservice bot"))
    },
    designator: ["help"],
    summary: "Display this message"
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("appservice bot", "help"),
    renderer: renderHelp
})

export class AppserviceCommandHandler {
    private readonly commandTable = findCommandTable("appservice bot");

    constructor(
        private readonly appservice: MjolnirAppService
    ) {

    }

    public handleEvent(mxEvent: WeakEvent): void {
        if (mxEvent.room_id !== this.appservice.config.adminRoom) {
            return;
        }
        const parsedEventResult = Value.Decode(RoomMessage, mxEvent);
        if (isError(parsedEventResult)) {
            return;
        }
        const parsedEvent = parsedEventResult.ok;
        const body = typeof mxEvent.content['body'] === 'string' ? mxEvent.content['body'] : '';
        if (body.startsWith(this.appservice.bridge.getBot().getUserId())) {
            const readItems = readCommand(body).slice(1); // remove "!mjolnir"
            const argumentStream = new ArgumentStream(readItems);
            const command = this.commandTable.findAMatchingCommand(argumentStream);
            if (command) {
                const adaptor = findMatrixInterfaceAdaptor(command);
                const context: AppserviceContext = {
                    appservice: this.appservice,
                    roomId: mxEvent.room_id,
                    event: parsedEvent,
                    client: this.appservice.bridge.getBot().getClient(),
                    emitter: new AppserviceBotEmitter(),
                };
                adaptor.invoke(context, context, ...argumentStream.rest());
                return;
            }
        }
    }
}
