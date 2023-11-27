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

import { MjolnirContext } from "./CommandHandler";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { JSXFactory } from "./interface-manager/JSXFactory";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor, MatrixContext, MatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { MatrixRoomReference } from "./interface-manager/MatrixRoomReference";
import { findPresentationType, parameters, union } from "./interface-manager/ParameterParsing";
import { CommandResult } from "./interface-manager/Validation";
import { UserID } from "matrix-bot-sdk";
import { MatrixSendClient } from "../MatrixEmitter";
import { ListRule } from "../models/ListRule";
import { PolicyRule } from "matrix-protection-suite";

async function renderListMatches(
    this: MatrixInterfaceAdaptor<MatrixContext>, client: MatrixSendClient, commandRoomId: string, event: any, result: CommandResult<ListMatches[]>
) {
    if (result.isErr()) {
        return await tickCrossRenderer.call(this, ...arguments);
    }
    const lists = result.ok;
    if (lists.length === 0) {
        return await renderMatrixAndSend(
            <root>No policy lists configured</root>,
            commandRoomId, event, client
        )
    }
    return await renderMatrixAndSend(
        <root>
            <b>Rules currently in use:</b><br/>
            {lists.map(list => renderListRules(list))}
        </root>,
        commandRoomId, event, client
    )
}

export function renderListRules(list: ListMatches) {
    const renderRuleSummary = (rule: ListRule, entityDescription: string) => {
        return <li>
            {entityDescription} (<code>{rule.recommendation}</code>): <code>{rule.entity}</code> ({rule.reason})
        </li>
    };
    return <fragment>
        <a href={list.roomRef}>{list.roomId}</a><br/>
        <ul>
            {list.matches.length === 0
                ? <li><i>No rules</i></li>
                : list.matches.map(rule => renderRuleSummary(rule, rule.kind))}
        </ul>
    </fragment>
}

interface ListMatches {
    roomRef: string,
    roomId: string,
    matches: PolicyRule[]
}

defineInterfaceCommand({
    designator: ["rules"],
    table: "mjolnir",
    parameters: parameters([]),
    command: async function (this: MjolnirContext) {
        return CommandResult.Ok(
            this.mjolnir.policyListManager.lists
                .map(list => {
                    return {
                        shortcode: list.listShortcode,
                        roomRef: list.roomRef,
                        roomId: list.roomId,
                        matches: list.allRules
                    }
                })
        );
    },
    summary: "Lists the rules currently in use by Mjolnir."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "rules"),
    renderer: renderListMatches
})

defineInterfaceCommand({
    designator: ["rules", "matching"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: "entity",
            acceptor: union(
                findPresentationType("UserID"),
                findPresentationType("MatrixRoomReference"),
                findPresentationType("string"),
            )
        }
    ]),
    command: async function (
        this: MjolnirContext, _keywords, entity: string|UserID|MatrixRoomReference
    ): Promise<CommandResult<ListMatches[]>> {
        return CommandResult.Ok(
            this.mjolnir.policyListManager.lists
                .map(list => {
                    return {
                        shortcode: list.listShortcode,
                        roomRef: list.roomRef,
                        roomId: list.roomId,
                        matches: list.rulesMatchingEntity(entity.toString())
                    }
                })
        );
    },
    summary: "Lists the rules in use that will match this entity e.g. `!rules matching @foo:example.com` will show all the user and server rules, including globs, that match this user"
})

// I'm pretty sure that both commands could merge and use the same rendeer.
defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "rules", "matching"),
    renderer: renderListMatches
})
