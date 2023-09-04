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
import { DocumentNode } from "../commands/interface-manager/DeadDocument";
import { renderMatrixAndSend } from "../commands/interface-manager/DeadDocumentMatrix";
import { JSXFactory } from "../commands/interface-manager/JSXFactory";
import { Permalinks } from "../commands/interface-manager/Permalinks";
import { MatrixSendClient } from "../MatrixEmitter";

export const ERROR_KIND_PERMISSION = "permission";
export const ERROR_KIND_FATAL = "fatal";

export interface RoomUpdateError {
    roomId: string;
    errorMessage: string;
    errorKind: string;
}

function renderErrorItem(error: RoomUpdateError, viaServers: string[]): DocumentNode {
    return <li>
        <a href={Permalinks.forRoom(error.roomId, viaServers)}>{error.roomId}</a> - {error.errorMessage}
    </li>
}

/**
 * Render a message to show to the user after taking an action in a room or a set of rooms.
 * @param client A matrix client.
 * @param errors Any errors associated with the action.
 * @param options.title To give context about what the action was, shown when there are errors.
 * @param options.noErrorsText To show when there are no errors.
 * @param options.skipNoErrors is ineffective and does nothing, it is an option for the accompnying `printActionResult`.
 * @returns A `DocumentNode` fragment that can be sent to Matrix or incorperated into another message.
 */
export async function renderActionResult(
    client: MatrixSendClient,
    errors: RoomUpdateError[],
    { title = 'There were errors updating protected rooms.', noErrorsText = 'Done updating rooms - no errors.'}: { title?: string, noErrorsText?: string } = {}
): Promise<DocumentNode> {
    if (errors.length === 0) {
        return <fragment><font color="#00cc00">{noErrorsText}</font></fragment>
    }
    // This is a little unfortunate because for some reason we don't have a way to keep
    // room references around that have vias and are meaningful
    // there isn't really any easy way to do this :(
    const viaServers = [(new UserID(await client.getUserId())).domain];
    return <fragment>
        <font color="#ff0000">
            {title}<br/>
        </font>
        <details>
            <summary>
                <font color="#ff0000">
                    <b>{errors.length} errors updating protected rooms!</b><br/>
                </font>
            </summary>
            <ul>
                {errors.map(error => renderErrorItem(error, viaServers))}
            </ul>
        </details>
    </fragment>
}

/**
 * Render a message to represent the outcome of an action in an update.
 * @param client A matrix client to send a notice with.
 * @param roomId The room to send the notice to.
 * @param errors Any errors that are a result of the action.
 * @param options.title To give context about what the action was, shown when there are errors.
 * @param options.noErrorsText To show when there are no errors.
 * @returns
 */
export async function printActionResult(
    client: MatrixSendClient,
    roomId: string,
    errors: RoomUpdateError[],
    renderOptions: { title?: string, noErrorsText?: string } = {}
): Promise<void> {
    await renderMatrixAndSend(
        <root>{await renderActionResult(client, errors, renderOptions)}</root>,
        roomId,
        undefined,
        client,
    )
}
