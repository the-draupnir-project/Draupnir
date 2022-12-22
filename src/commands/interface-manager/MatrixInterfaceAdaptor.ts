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

import { ValidationError } from "./Validation";
import { RichReply, LogService, MatrixClient } from "matrix-bot-sdk";
import { ReadItem } from "./CommandReader";
import { MatrixSendClient } from "../../MatrixEmitter";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";

export interface MatrixContext {
    client: MatrixSendClient,
    roomId: string,
    event: any,
}

type RendererSignature<ExecutorReturnType extends Promise<any>> = (
    client: MatrixClient,
    commandRoomId: string,
    event: any,
    result: Awaited<ExecutorReturnType>) => Promise<void>;

class MatrixInterfaceAdaptor<C extends MatrixContext, ExecutorType extends BaseFunction> {
    constructor(
        public readonly interfaceCommand: InterfaceCommand<ExecutorType>,
        private readonly renderer: RendererSignature<ReturnType<ExecutorType>>,
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
    public async invoke(executorContext: ThisParameterType<ExecutorType>, matrixContext: C, ...args: ReadItem[]): Promise<void> {
        const executorResult: Awaited<ReturnType<typeof this.interfaceCommand.parseThenInvoke>> = await this.interfaceCommand.parseThenInvoke(executorContext, ...args);
        if (executorResult.isErr()) {
            this.reportValidationError(matrixContext.client, matrixContext.roomId, matrixContext.event, executorResult.err);
            return;
        }
        // just give the renderer the MatrixContext.
        await this.renderer.apply(this, [matrixContext.client, matrixContext.roomId, matrixContext.event, executorResult]);
    }

    private async reportValidationError(client: MatrixSendClient, roomId: string, event: any, validationError: ValidationError): Promise<void> {
        LogService.info("MatrixInterfaceCommand", `User input validation error when parsing command ${JSON.stringify(this.interfaceCommand.designator)}: ${validationError.message}`);
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
        renderer: RendererSignature<ReturnType<ExecutorType>>
    }) {
    internMatrixInterfaceAdaptor(
        details.interfaceCommand,
        new MatrixInterfaceAdaptor(
            details.interfaceCommand,
            details.renderer
        )
    );
}
