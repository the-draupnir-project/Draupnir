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
import { InterfaceAcceptor, PromptOptions, PromptableArgumentStream } from "./PromptForAccept";
import { ParameterDescription } from "./ParameterParsing";
import { promptDefault, promptSuggestions } from "./MatrixPromptForAccept";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { ActionError, ActionResult, ClientPlatform, ResultError, RoomEvent, StringRoomID, Task, isError } from "matrix-protection-suite";
import { MatrixReactionHandler } from "./MatrixReactionHandler";
import { PromptRequiredError } from "./PromptRequiredError";

export interface MatrixContext {
    reactionHandler: MatrixReactionHandler,
    client: MatrixSendClient,
    // Use the client platform capabilities over the `MatrixSendClient`, since
    // they can use join preemption.
    // TODO: How can we make commands declare which things they want (from the context)
    // similar to capability providers in MPS protections?
    // we kind of need to remove the context object.
    clientPlatform: ClientPlatform,
    roomID: StringRoomID,
    event: RoomEvent,
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
        const stream = new PromptableArgumentStream(args, this);
        const executorResult: Awaited<ReturnType<typeof this.interfaceCommand.parseThenInvoke>> = await this.interfaceCommand.parseThenInvoke(executorContext, stream);
        // FIXME: IT's really not clear to me what reportValidationError is
        // or how `renderer` gets called if a command fails?
        // maybe it never did, i think the validation error handler uses tick cross renderer :skull:
        // so it'd be hard to know.
        if (isError(executorResult)) {
            if (executorResult.error instanceof PromptRequiredError) {
                const parameter = executorResult.error.parameterRequiringPrompt as ParameterDescription<ExecutorType>;
                if (parameter.prompt === undefined) {
                    throw new TypeError(`A PromptRequiredError was given for a parameter which doesn't support prompts, this shouldn't happen`);
                }
                const promptOptions: PromptOptions = await parameter.prompt.call(executorContext, parameter);
                if (promptOptions.default) {
                    await promptDefault.call(matrixContext, parameter, this.interfaceCommand, promptOptions.default, args);
                } else {
                    await promptSuggestions.call(matrixContext, parameter, this.interfaceCommand, promptOptions.suggestions, args);
                }
                return;
            } else {
                void Task(this.reportValidationError(matrixContext.client, matrixContext.roomID, matrixContext.event, executorResult.error));
                return;
            }
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
    private async reportValidationError(client: MatrixSendClient, roomID: StringRoomID, event: RoomEvent, validationError: ActionError): Promise<void> {
        LogService.info("MatrixInterfaceCommand", `User input validation error when parsing command ${JSON.stringify(this.interfaceCommand.designator)}: ${validationError.message}`);
        if (this.validationErrorHandler) {
            await this.validationErrorHandler(client, roomID, event, validationError);
            return;
        }
        await tickCrossRenderer.call(this, client, roomID, event, ResultError(validationError));
    }
}

const MATRIX_INTERFACE_ADAPTORS = new Map<InterfaceCommand, MatrixInterfaceAdaptor<MatrixContext>>();

function internMatrixInterfaceAdaptor(interfaceCommand: InterfaceCommand, adapator: MatrixInterfaceAdaptor<MatrixContext>): void {
    if (MATRIX_INTERFACE_ADAPTORS.has(interfaceCommand)) {
        throw new TypeError(`An adaptor is already defined for the command ${interfaceCommand.designator.toString()}`);
    }
    MATRIX_INTERFACE_ADAPTORS.set(interfaceCommand, adapator);
}

export function findMatrixInterfaceAdaptor(interfaceCommand: InterfaceCommand): MatrixInterfaceAdaptor<MatrixContext> {
    const entry = MATRIX_INTERFACE_ADAPTORS.get(interfaceCommand);
    if (entry) {
        return entry
    }
    throw new TypeError(`Couldn't find an adaptor for the command ${interfaceCommand.designator.toString()}`);
}

/**
 * Define a command to be interfaced via Matrix.
 * @param commandParts constant parts used to discriminate the command e.g. "ban" or "config" "get"
 * @param parser A function that parses a Matrix Event from a room to be able to invoke an ApplicationCommand.
 * @param applicationCommmand The ApplicationCommand this is an interface wrapper for.
 * @param renderer Render the result of the application command back to a room.
 */
export function defineMatrixInterfaceAdaptor<ExecutorType extends BaseFunction>(details: {
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
