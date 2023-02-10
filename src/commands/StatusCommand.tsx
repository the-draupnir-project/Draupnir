/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2022 The Matrix.org Foundation C.I.C.

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

import { STATE_CHECKING_PERMISSIONS, STATE_NOT_STARTED, STATE_RUNNING, STATE_SYNCING } from "../Mjolnir";
import { RichReply } from "matrix-bot-sdk";
import PolicyList from "../models/PolicyList";
import { PACKAGE_JSON, SOFTWARE_VERSION } from "../config";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, parameters, RestDescription } from "./interface-manager/ParameterParsing";
import { MjolnirContext } from "./CommandHandler";
import { CommandError, CommandResult } from "./interface-manager/Validation";
import { defineMatrixInterfaceAdaptor, MatrixContext, MatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { MatrixSendClient } from "../MatrixEmitter";
import { JSXFactory } from "./interface-manager/JSXFactory";
import { Protection } from "../protections/IProtection";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";

defineInterfaceCommand({
    designator: ["status"],
    table: "mjolnir",
    parameters: parameters([]),
    command: async function () { return CommandResult.Ok(mjolnirStatusInfo.call(this)) },
    summary: "Show the status of the bot."
})

export interface ListInfo {
    shortcode: string,
    roomRef: string,
    roomId: string,
    serverRules: number,
    userRules: number,
    roomRules: number,
}

export interface StatusInfo {
    state: string, // a small description of the state of Mjolnir
    numberOfProtectedRooms: number,
    subscribedLists: ListInfo[],
    subscribedAndProtectedLists: ListInfo[],
    version: string,
    repository: string
}


function mjolnirStatusInfo(this: MjolnirContext): StatusInfo {
    const listInfo = (list: PolicyList): ListInfo => {
        return {
            shortcode: list.listShortcode,
            roomRef: list.roomRef,
            roomId: list.roomId,
            serverRules: list.serverRules.length,
            userRules: list.userRules.length,
            roomRules: list.roomRules.length,
        }
    }
    return {
        state: this.mjolnir.state,
        numberOfProtectedRooms: this.mjolnir.protectedRoomsTracker.getProtectedRooms().length,
        subscribedLists: this.mjolnir.policyListManager.lists
            .filter(list => !this.mjolnir.explicitlyProtectedRooms.includes(list.roomId))
            .map(listInfo),
        subscribedAndProtectedLists: this.mjolnir.policyListManager.lists
            .filter(list => this.mjolnir.explicitlyProtectedRooms.includes(list.roomId))
            .map(listInfo),
        version: SOFTWARE_VERSION,
        repository: PACKAGE_JSON['repository'] ?? 'Unknown'
    }
}

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "status"),
    renderer: async function (this: MatrixInterfaceAdaptor<MatrixContext>, client: MatrixSendClient, commandRoomId: string, event: any, result: CommandResult<StatusInfo>): Promise<void> {
        const renderState = (state: StatusInfo['state']) => {
            const notRunning = (text: string) => {
                return <fragment><b>Running: </b>❌ (${text})<br/></fragment>
            };
            switch (state) {
                case STATE_NOT_STARTED:
                    return notRunning('not started');
                case STATE_CHECKING_PERMISSIONS:
                    return notRunning('checking own permission');
                case STATE_SYNCING:
                    return notRunning('syncing lists');
                case STATE_RUNNING:
                    return <fragment><b>Running: </b>✅<br/></fragment>
                default:
                    return notRunning('unknown state');
            }
        };
        const renderPolicyLists = (header: string, lists: ListInfo[]) => {
            const listInfo = lists.map(list => {
                return <li>
                    {list.shortcode} @ <a href={list.roomRef}>{list.roomId}</a>
                    (rules: {list.serverRules} servers, {list.userRules} users, {list.roomRules} rooms)
                </li>
            });
            return <fragment>
                <b>{header}</b><br/>
                <ul>
                    {listInfo.length === 0 ? <li><i>None</i></li> : listInfo}
                </ul>
            </fragment>
        };
        const info = result.ok;

        await renderMatrixAndSend(<root>
            {renderState(info.state)}
            <b>Protected Rooms: </b>{info.numberOfProtectedRooms}<br/>
            {renderPolicyLists('Subscribed policy lists', info.subscribedLists)}
            {renderPolicyLists('Subscribed and protected policy lists', info.subscribedAndProtectedLists)}
            <b>Version: </b><code>{info.version}</code><br/>
            <b>Repository: </b><code>{info.repository}</code><br/>
        </root>,
        commandRoomId,
        event,
        client);
    }
});

defineInterfaceCommand({
    designator: ["status", "protection"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: "protection name",
            acceptor: findPresentationType("string")
        },
    ],
    new RestDescription<MjolnirContext>(
        "subcommand",
        findPresentationType("string")
    )),
    command: async function (
        this: MjolnirContext, _keywords, protectionName: string, ...subcommands: string[]
    ): Promise<CommandResult<Awaited<ReturnType<Protection['statusCommand']>>>> {
        const protection = this.mjolnir.protectionManager.getProtection(protectionName);
        if (!protection) {
            return CommandError.Result(`Unknown protection ${protectionName}`);
        }
        return CommandResult.Ok(await protection.statusCommand(this.mjolnir, subcommands))
    },
    summary: "Show the status of a protection."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "status", "protection"),
    renderer: async function(client, commandRoomId, event, result) {
        tickCrossRenderer.call(this, ...arguments);
        if (result.isErr()) {
            return; // tickCrossRenderer will handle it.
        }
        const status = result.ok;
        const reply = RichReply.createFor(
            commandRoomId,
            event,
            status?.text ?? "<no status>",
            status?.html ?? "&lt;no status&gt;"
        );
        reply["msgtype"] = "m.notice";
        await client.sendMessage(commandRoomId, reply);
    }
})
