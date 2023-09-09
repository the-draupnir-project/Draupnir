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
import { CommandResult } from '../../commands/interface-manager/Validation';
import { renderHelp } from '../../commands/interface-manager/MatrixHelpRenderer';

defineCommandTable("appservice bot");

export interface AppserviceContext extends MatrixContext {
    appservice: MjolnirAppService;
}

export type AppserviceBaseExecutor = (this: AppserviceContext, ...args: any[]) => Promise<CommandResult<any>>;

import '../../commands/interface-manager/MatrixPresentations';
import './ListCommand';
import './AccessCommands';
import { AppserviceBotEmitter } from './AppserviceBotEmitter';
import { trace } from '../../utils';


defineInterfaceCommand({
    parameters: parameters([], new RestDescription('command parts', findPresentationType("any"))),
    table: "appservice bot",
    command: async function () { return CommandResult.Ok(findCommandTable("appservice bot")) },
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

    @trace
    public async handleEvent(mxEvent: WeakEvent): Promise<void> {
        if (mxEvent.type !== 'm.room.message' && mxEvent.room_id !== this.appservice.config.adminRoom) {
            return;
        }
        const body = typeof mxEvent.content['body'] === 'string' ? mxEvent.content['body'] : '';
        const ownUserId = this.appservice.bridge.getBot().getUserId();
        const localpart = ownUserId.split(":")[0].substring(1);
        const ownProfile = await this.appservice.bridge.getBot().getClient().getUserProfile(ownUserId);
        const prefixes = [
            localpart + ":",
            ownUserId + ":",
            localpart + " ",
            ownUserId + " "
        ];
        if (ownProfile) {
            prefixes.push(...[
                ownProfile['displayname'] + ":",
                ownProfile['displayname'] + " "
            ])
        }


        const prefixUsed = prefixes.find(p => body.toLowerCase().startsWith(p.toLowerCase()));
        if (!prefixUsed) return;

        console.log("Got admin command");
        let restOfBody = body.substring(prefixUsed.length);
        const readItems = readCommand(restOfBody)
        const argumentStream = new ArgumentStream(readItems);
        const command = this.commandTable.findAMatchingCommand(argumentStream);
        if (command) {
            const adaptor = findMatrixInterfaceAdaptor(command);
            const context: AppserviceContext = {
                appservice: this.appservice,
                roomId: mxEvent.room_id,
                event: mxEvent,
                client: this.appservice.bridge.getBot().getClient(),
                emitter: new AppserviceBotEmitter(),
            };
            await adaptor.invoke(context, context, ...argumentStream.rest());
            return;
        }

    }
}
