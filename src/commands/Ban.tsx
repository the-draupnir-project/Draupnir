/**
 * Copyright (C) 2022-2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2021 The Matrix.org Foundation C.I.C.

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

import { MatrixRoomReference } from "./interface-manager/MatrixRoomReference";
import { UserID } from "matrix-bot-sdk";
import { MjolnirContext } from "./CommandHandler";
import { CommandError, CommandResult } from "./interface-manager/Validation";
import { Mjolnir } from "../Mjolnir";
import { RULE_ROOM, RULE_SERVER, RULE_USER } from "../models/ListRule";
import PolicyList from "../models/PolicyList";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, makePresentationType, ParameterDescription, parameters, ParsedKeywords, RestDescription, simpleTypeValidator, union } from "./interface-manager/ParameterParsing";
import "./interface-manager/MatrixPresentations";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { PromptOptions } from "./interface-manager/PromptForAccept";
import { definePresentationRenderer } from "./interface-manager/DeadDocumentPresentation";
import { DocumentNode } from "./interface-manager/DeadDocument";
import { JSXFactory } from "./interface-manager/JSXFactory";

makePresentationType({
    name: "PolicyList",
    validator: simpleTypeValidator("PolicyList", (readItem: unknown) => readItem instanceof PolicyList)
})

definePresentationRenderer(findPresentationType("PolicyList"), function(list: PolicyList): DocumentNode {
    return <p>
        {list.listShortcode} <a href={list.roomRef}>{list.roomId}</a>
    </p>
})


export async function findPolicyListFromRoomReference(mjolnir: Mjolnir, policyListReference: MatrixRoomReference): Promise<CommandResult<PolicyList, CommandError>> {
    const policyListRoomId = (await policyListReference.resolve(mjolnir.client)).toRoomIdOrAlias();
    const policyList = mjolnir.policyListManager.lists.find(list => list.roomId === policyListRoomId);
    if (policyList !== undefined) {
        return CommandResult.Ok(policyList);
    } else {
        // Would it be acceptable to create an anonymous policy list that is not being watched
        // by mjolnir for the purposes of banning / unbanning? unbanning requires loading the rules
        // but banning doesn't.. so this means you'd want two types of lists
        // one of which can only be made by a factory which watches them via sync
        // and makes sure mjolnir is joined.
        // This refactor would be important for previewing lists regardless.
        return CommandError.Result(`There is no policy list that Mjolnir is watching for ${policyListReference.toPermalink()}`);
    }
}

export async function findPolicyListFromShortcode(mjolnir: Mjolnir, designator: string): Promise<CommandResult<PolicyList, CommandError>> {
    const list = mjolnir.policyListManager.resolveListShortcode(designator);
    if (list !== undefined) {
        return CommandResult.Ok(list);
    } else {
        return CommandError.Result(`There is no policy list with the shortcode ${designator} and a default list couldn't be found`);
    }
}

async function ban(
    this: MjolnirContext,
    _keywords: ParsedKeywords,
    entity: UserID|MatrixRoomReference|string,
    policyListReference: MatrixRoomReference|string|PolicyList,
    ...reasonParts: string[]
    ): Promise<CommandResult<any, CommandError>> {
        // first step is to resolve the policy list
        const policyListResult = typeof policyListReference === 'string'
            ? await findPolicyListFromShortcode(this.mjolnir, policyListReference)
            : policyListReference instanceof PolicyList
            ? CommandResult.Ok(policyListReference)
            : await findPolicyListFromRoomReference(this.mjolnir, policyListReference);
        if (policyListResult.isErr()) {
            return policyListResult;
        }
        const policyList = policyListResult.ok;

        const reason = reasonParts.join(' ');

        if (entity instanceof UserID) {
            await policyList.banEntity(RULE_USER, entity.toString(), reason);
        } else if (entity instanceof MatrixRoomReference) {
            await policyList.banEntity(RULE_ROOM, entity.toRoomIdOrAlias(), reason);
        } else {
            await policyList.banEntity(RULE_SERVER, entity, reason);
        }
        return CommandResult.Ok(undefined);
    }

defineInterfaceCommand({
    designator: ["ban"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: "entity",
            acceptor: union(
                findPresentationType("UserID"),
                findPresentationType("MatrixRoomReference"),
                findPresentationType("string")
            )
        },
        {
            name: "list",
            acceptor: union(
                findPresentationType("MatrixRoomReference"),
                findPresentationType("string"),
                findPresentationType("PolicyList"),
            ),
            prompt: async function (this: MjolnirContext, parameter: ParameterDescription): Promise<PromptOptions> {
                return {
                    suggestions: this.mjolnir.policyListManager.lists
                };
            }
        },
    ],
    new RestDescription<MjolnirContext>(
        "reason",
        findPresentationType("string"),
        async function(_parameter) {
            return {
                suggestions: this.mjolnir.config.commands.ban.defaultReasons
            }
        }),
    ),
    command: ban,
    summary: "Bans an entity from the policy list."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "ban"),
    renderer: tickCrossRenderer
})
