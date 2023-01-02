/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2022 The Matrix.org Foundation C.I.C.

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

/**
 * When we do move these components into their own library,
 * I'd like to remove the dependency on matrix-bot-sdk.
 */

import { ApplicationCommand, ApplicationFeature, getApplicationFeature } from "./ApplicationCommand";
import { ValidationError, ValidationResult } from "./Validation";
import { RichReply, LogService, MatrixClient } from "matrix-bot-sdk";
import { ReadItem } from "./CommandReader";
import { MatrixSendClient } from "../../MatrixEmitter";


/**
 * 💀 . o O ( at least I don't have to remember the types )
 * https://matrix-client.matrix.org/_matrix/media/r0/download/matrix.org/nbisOFhCcTzNicZrfixWMHZn
 * Probably am "doing something wrong", and no, trying to make this protocol isn't it.
 */

type CommandLookupEntry = Map<string|symbol, CommandLookupEntry|MatrixInterfaceCommand<MatrixContext, BaseFunction>>;

type BaseFunction = (...args: any) => Promise<any>;
const FLATTENED_MATRIX_COMMANDS = new Set<MatrixInterfaceCommand<MatrixContext, BaseFunction>>();
const THIS_COMMAND_SYMBOL = Symbol("thisCommand");

export interface MatrixContext {
    client: MatrixSendClient,
    roomId: string,
    event: any,
}

type ParserSignature<C extends MatrixContext, ExecutorType extends (...args: any) => Promise<any>> = (
    this: MatrixInterfaceCommand<C, ExecutorType>,
    // The idea then is that this can be extended to include a Mjolnir or whatever.
    context: C,
    ...parts: ReadItem[]) => Promise<ValidationResult<Parameters<ExecutorType>>>;

type RendererSignature<C extends MatrixContext, ExecutorType extends BaseFunction> = (
    this: MatrixInterfaceCommand<C, ExecutorType>,
    client: MatrixClient,
    commandRoomId: string,
    event: any,
    result: Awaited<ReturnType<ExecutorType>>) => Promise<void>;

/**
 * A command that interfaces with a user via Matrix.
 * The command wraps an `ApplicationCommand` to make it available to Matrix.
 * To do this. A MatrixInterfaceCommand needs to parse an event and the context
 * that it was received in with a `parser` and then render the result
 * of an `ApplicationCommand` with a `renderer`, which really means
 * rendering and sending a matrix event.
 *
 * Note, matrix interface command can be multi step ie ask for confirmation.
 * From the perspective here, confirmation should be a distinct thing that happens
 * before the interface command is invoked.
 *
 * When confirmation is required in the middle of a traditional command ie preview kick
 * the preview command should be a distinct command.
 */
class MatrixInterfaceCommand<C extends MatrixContext, ExecutorType extends (...args: any) => Promise<any>> {
    constructor(
        public readonly commandParts: string[],
        private readonly parser: ParserSignature<C, ExecutorType>,
        public readonly applicationCommand: ApplicationCommand<ExecutorType>,
        private readonly renderer: RendererSignature<C, ExecutorType>,
        private readonly validationErrorHandler?: (client: MatrixClient, roomId: string, event: any, validationError: ValidationError) => Promise<void>
    ) {

    }

    /**
     * Parse the context required by the command, call the associated application command and then render the result to a Matrix room.
     * The arguments to invoke will be given directly to the parser.
     * The executor of the application command will then be applied to whatever is returned by the parser.
     * Then the renderer will be applied to the same arguments given to the parser (so it knows which matrix room to respond to)
     * along with the result of the executor.
     * @param args These will be the arguments to the parser function.
     */
    public async invoke(...args: Parameters<ParserSignature<C, ExecutorType>>): Promise<void> {
        const parseResults = await this.parser(...args);
        const matrixContext: MatrixContext = args.at(0) as MatrixContext;
        if (parseResults.isErr()) {
            this.reportValidationError.apply(this, [matrixContext.client, matrixContext.roomId, matrixContext.event, parseResults.err]);
            return;
        }
        const executorResult: ReturnType<ExecutorType> = await this.applicationCommand.executor.apply(this, parseResults.ok);
        // just give the renderer the MatrixContext.

        await this.renderer.apply(this, [matrixContext.client, matrixContext.roomId, matrixContext.event, executorResult]);
    }

    private async reportValidationError(client: MatrixClient, roomId: string, event: any, validationError: ValidationError): Promise<void> {
        LogService.info("MatrixInterfaceCommand", `User input validation error when parsing command ${this.commandParts}: ${validationError.message}`);
        if (this.validationErrorHandler) {
            await this.validationErrorHandler.apply(this, arguments);
            return;
        }
        const replyMessage = validationError.message;
        const reply = RichReply.createFor(roomId, event, replyMessage, replyMessage);
        reply["msgtype"] = "m.notice";
        await client.sendMessage(roomId, reply);
    }
}

/**
 * Define a command to be interfaced via Matrix.
 * @param commandParts constant parts used to discriminate the command e.g. "ban" or "config" "get"
 * @param parser A function that parses a Matrix Event from a room to be able to invoke an ApplicationCommand.
 * @param applicationCommmand The ApplicationCommand this is an interface wrapper for.
 * @param renderer Render the result of the application command back to a room.
 */
export function defineMatrixInterfaceCommand<C extends MatrixContext, ExecutorType extends (...args: any) => Promise<any>>(
        commandParts: string[],
        parser: ParserSignature<C, ExecutorType>,
        applicationCommmand: ApplicationCommand<ExecutorType>,
        renderer: RendererSignature<C, ExecutorType>) {
    FLATTENED_MATRIX_COMMANDS.add(
        new MatrixInterfaceCommand(
            commandParts,
            parser,
            applicationCommmand,
            renderer
        )
    );
}


/**
 * This can be used by mjolnirs or an appservice bot.
 */
export class MatrixCommandTable<C extends MatrixContext> {
    public readonly features: ApplicationFeature[];
    private readonly flattenedCommands: Set<MatrixInterfaceCommand<C, BaseFunction>>;
    private readonly commands: CommandLookupEntry = new Map();

    constructor(featureNames: string[]) {
        this.features = featureNames.map(name => {
            const feature = getApplicationFeature(name);
            if (feature) {
                return feature
            } else {
                throw new TypeError(`Couldn't find feature with name ${name}`)
            }
        });

        const commandHasFeatures = (command: ApplicationCommand<BaseFunction>) => {
            return command.requiredFeatures.every(feature => this.features.includes(feature))
        }
        this.flattenedCommands = new Set([...FLATTENED_MATRIX_COMMANDS]
            .filter(interfaceCommand => commandHasFeatures(interfaceCommand.applicationCommand)));
        [...this.flattenedCommands].forEach(this.internCommand, this);
    }

    public findAMatchingCommand(readItems: ReadItem[]) {
        const getCommand = (table: CommandLookupEntry): undefined|MatrixInterfaceCommand<C, BaseFunction> => {
            const command = table.get(THIS_COMMAND_SYMBOL);
            if (command instanceof Map) {
                throw new TypeError("There is an implementation bug, only commands should be stored under the command symbol");
            }
            return command;
        };
        const tableHelper = (table: CommandLookupEntry, nextParts: ReadItem[]): undefined|MatrixInterfaceCommand<C, BaseFunction> => {
            if (nextParts.length === 0 || typeof nextParts.at(0) !== 'string') {
                // Then they might be using something like "!mjolnir status"
                return getCommand(table);
            }
            const entry = table.get(nextParts.shift()! as string);
            if (!entry) {
                // The reason there's no match is because this is the command arguments, rather than subcommand notation.
                return getCommand(table);
            } else {
                if (!(entry instanceof Map)) {
                    throw new TypeError("There is an implementation bug, only maps should be stored under arbirtrary keys");
                }
                return tableHelper(entry, nextParts);
            }
        };
        return tableHelper(this.commands, [...readItems]);
    }

    public async invokeAMatchingCommand(context: C, readItems: ReadItem[]): Promise<void> {
        const command = this.findAMatchingCommand(readItems);
        if (command) {
            const itmesWithoutCommandDesignators = readItems.slice(command.commandParts.length)
            await command.invoke(context, ...itmesWithoutCommandDesignators);
        }
    }

    private internCommand(command: MatrixInterfaceCommand<C, BaseFunction>) {
        const internCommandHelper = (table: CommandLookupEntry, commandParts: string[]): void => {
            if (commandParts.length === 0) {
                if (table.has(THIS_COMMAND_SYMBOL)) {
                    throw new TypeError(`There is already a command for ${JSON.stringify(commandParts)}`)
                }
                table.set(THIS_COMMAND_SYMBOL, command);
            } else {
                const nextTable = new Map();
                table.set(commandParts.shift()!, nextTable);
                internCommandHelper(nextTable, commandParts);
            }
        }

        internCommandHelper(this.commands, [...command.commandParts]);
    }
}
