/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * Which includes the following license notice:
 *
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
 * are NOT distributed, contributed, or committed under the Apache License.
 */

/**
 * When we do move these components into their own library,
 * I'd like to remove the dependency on matrix-bot-sdk.
 */

import { LogService } from "matrix-bot-sdk";
import { ReadItem } from "./CommandReader";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { tickCrossRenderer } from "./MatrixHelpRenderer";
import { CommandInvocationRecord, InterfaceAcceptor, PromptableArgumentStream, PromptOptions } from "./PromptForAccept";
import { ParameterDescription } from "./ParameterParsing";
import { matrixPromptForAccept } from "./MatrixPromptForAccept";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { ActionError, ActionResult, ResultError, RoomEvent, RoomMessage, StringRoomID, isError } from "matrix-protection-suite";
import { MatrixReactionHandler } from "./MatrixReactionHandler";

export interface MatrixContext {
    reactionHandler: MatrixReactionHandler,
    client: MatrixSendClient,
    roomID: StringRoomID,
    event: RoomMessage,
}

export type RendererSignature<C extends MatrixContext, ExecutorType extends BaseFunction> = (
    this: MatrixInterfaceAdaptor<C, ExecutorType>,
    client: MatrixSendClient,
    commandRoomID: StringRoomID,
    event: RoomEvent,
    result: ActionResult<unknown>) => Promise<void>;

export class MatrixInterfaceAdaptor<C extends MatrixContext, ExecutorType extends BaseFunction = BaseFunction> implements InterfaceAcceptor {
    public readonly isPromptable = true;
    constructor(
        public readonly interfaceCommand: InterfaceCommand<ExecutorType>,
        private readonly renderer: RendererSignature<C, ExecutorType>,
        private readonly validationErrorHandler?: (client: MatrixSendClient, roomID: StringRoomID, event: RoomEvent, validationError: ActionError) => Promise<void>
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
    public async invoke(executorContext: ThisParameterType<ExecutorType>, matrixContext: C, ...args: ReadItem[]): Promise<void> {
        const invocationRecord = new MatrixInvocationRecord<ThisParameterType<ExecutorType>>(this.interfaceCommand, executorContext, matrixContext);
        const stream = new PromptableArgumentStream(args, this, invocationRecord);
        const executorResult: Awaited<ReturnType<typeof this.interfaceCommand.parseThenInvoke>> = await this.interfaceCommand.parseThenInvoke(executorContext, stream);
        if (isError(executorResult)) {
            this.reportValidationError(matrixContext.client, matrixContext.roomID, matrixContext.event, executorResult.error);
            return;
        }
        // just give the renderer the MatrixContext.
        // we need to give the renderer the command itself!
        await this.renderer.apply(this, [matrixContext.client, matrixContext.roomID, matrixContext.event, executorResult]);
    }

    // is this still necessary, surely this should be handled entirely by the renderer?
    // well an argument against it being handled entirely by the renderer is that this provides a clear distinction between an error during parsing
    // and an error discovered because their is a fault or an error running the command. Though i don't think this is correct
    // since any CommandError recieved is an expected error. It means there is no fault. An exception on the other hand does
    // so this suggests we should just remove this.
    private async reportValidationError(client: MatrixSendClient, roomID: StringRoomID, event: RoomMessage, validationError: ActionError): Promise<void> {
        LogService.info("MatrixInterfaceCommand", `User input validation error when parsing command ${JSON.stringify(this.interfaceCommand.designator)}: ${validationError.message}`);
        if (this.validationErrorHandler) {
            await this.validationErrorHandler.apply(this, arguments);
            return;
        }
        await tickCrossRenderer.call(this, client, roomID, event, ResultError(validationError));
    }

    public async promptForAccept<PresentationType = unknown>(parameter: ParameterDescription, invocationRecord: CommandInvocationRecord): Promise<ActionResult<PresentationType>> {
        if (!(invocationRecord instanceof MatrixInvocationRecord)) {
            throw new TypeError("The MatrixInterfaceAdaptor only supports invocation records that were produced by itself.");
        }
        if (parameter.prompt === undefined) {
            throw new TypeError(`parameter ${parameter.name} in command ${JSON.stringify(invocationRecord.command.designator)} is not promptable, yet the MatrixInterfaceAdaptor is being prompted`);
        }
        // Slowly starting to think that we're making a mistake by using `this` so much....
        // First extract the prompt results in the command executor context
        const promptOptions: PromptOptions = await parameter.prompt.call(invocationRecord.executorContext, parameter);
        // Then present the prompt.
        const promptResult: Awaited<ReturnType<typeof matrixPromptForAccept<PresentationType>>> = await matrixPromptForAccept.call(invocationRecord.matrixContext, parameter, invocationRecord.command, promptOptions);
        return promptResult;
    }
}

export class MatrixInvocationRecord<ExecutorContext> implements CommandInvocationRecord {
    constructor(
        public readonly command: InterfaceCommand<BaseFunction>,
        public readonly executorContext: ExecutorContext,
        public readonly matrixContext: MatrixContext,
    ) {

    }
}


const MATRIX_INTERFACE_ADAPTORS = new Map<InterfaceCommand<BaseFunction>, MatrixInterfaceAdaptor<MatrixContext, BaseFunction>>();

function internMatrixInterfaceAdaptor(interfaceCommand: InterfaceCommand<BaseFunction>, adapator: MatrixInterfaceAdaptor<MatrixContext, BaseFunction>): void {
    if (MATRIX_INTERFACE_ADAPTORS.has(interfaceCommand)) {
        throw new TypeError(`An adaptor is already defined for the command ${interfaceCommand.designator}`);
    }
    MATRIX_INTERFACE_ADAPTORS.set(interfaceCommand, adapator);
}

export function findMatrixInterfaceAdaptor(interfaceCommand: InterfaceCommand<BaseFunction>): MatrixInterfaceAdaptor<MatrixContext, BaseFunction> {
    const entry = MATRIX_INTERFACE_ADAPTORS.get(interfaceCommand);
    if (entry) {
        return entry
    }
    throw new TypeError(`Couldn't find an adaptor for the command ${interfaceCommand.designator}`);
}

/**
 * Define a command to be interfaced via Matrix.
 * @param commandParts constant parts used to discriminate the command e.g. "ban" or "config" "get"
 * @param parser A function that parses a Matrix Event from a room to be able to invoke an ApplicationCommand.
 * @param applicationCommmand The ApplicationCommand this is an interface wrapper for.
 * @param renderer Render the result of the application command back to a room.
 */
export function defineMatrixInterfaceAdaptor<ExecutorType extends (...args: any) => Promise<any>>(details: {
        interfaceCommand: InterfaceCommand<ExecutorType>,
        renderer: RendererSignature<MatrixContext, ExecutorType>
    }) {
    internMatrixInterfaceAdaptor(
        details.interfaceCommand,
        new MatrixInterfaceAdaptor(
            details.interfaceCommand,
            details.renderer
        )
    );
}
