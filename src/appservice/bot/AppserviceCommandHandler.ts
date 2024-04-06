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
import { ActionResult, ClientPlatform, Ok, RoomMessage, StringRoomID, StringUserID, Value, isError } from 'matrix-protection-suite';
import { MatrixSendClient } from 'matrix-protection-suite-for-matrix-bot-sdk';
import { MatrixReactionHandler } from '../../commands/interface-manager/MatrixReactionHandler';
import { ARGUMENT_PROMPT_LISTENER, DEFAUILT_ARGUMENT_PROMPT_LISTENER, makeListenerForArgumentPrompt, makeListenerForPromptDefault } from '../../commands/interface-manager/MatrixPromptForAccept';

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
    private commandContext: Omit<AppserviceContext, 'event'>;
    private readonly reactionHandler: MatrixReactionHandler;

    constructor(
        public readonly clientUserID: StringUserID,
        private readonly client: MatrixSendClient,
        private readonly adminRoomID: StringRoomID,
        private readonly clientPlatform: ClientPlatform,
        private readonly appservice: MjolnirAppService,
    ) {
        this.reactionHandler = new MatrixReactionHandler(
            this.appservice.accessControlRoomID,
            this.appservice.bridge.getBot().getClient(),
            this.appservice.botUserID
        );
        this.commandContext = {
            appservice: this.appservice,
            client: this.client,
            clientPlatform: this.clientPlatform,
            reactionHandler: this.reactionHandler,
            roomID: this.appservice.accessControlRoomID
        };
        this.reactionHandler.on(ARGUMENT_PROMPT_LISTENER, makeListenerForArgumentPrompt(
            this.commandContext.client,
            this.clientPlatform,
            this.appservice.accessControlRoomID,
            this.reactionHandler,
            this.commandTable,
            this.commandContext
        ));
        this.reactionHandler.on(DEFAUILT_ARGUMENT_PROMPT_LISTENER, makeListenerForPromptDefault(
            this.commandContext.client,
            this.clientPlatform,
            this.appservice.accessControlRoomID,
            this.reactionHandler,
            this.commandTable,
            this.commandContext
        ));
    }

    public handleEvent(mxEvent: WeakEvent): void {
        if (mxEvent.room_id !== this.adminRoomID) {
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
                    ...this.commandContext,
                    event: parsedEvent,
                };
                adaptor.invoke(context, context, ...argumentStream.rest());
                return;
            }
        }
    }
}
