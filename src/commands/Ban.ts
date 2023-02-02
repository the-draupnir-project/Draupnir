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
import { findPresentationType, paramaters, ParsedKeywords, RestDescription, union } from "./interface-manager/ParamaterParsing";
import "./interface-manager/MatrixPresentations";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";

export async function findPolicyListFromRoomReference(mjolnir: Mjolnir, policyListReference: MatrixRoomReference): Promise<CommandResult<PolicyList, CommandError>> {
    // do we need to catch 404 here so we can tell the user the alias was wrong?
    // Can we shortcut this by making a specific presentaion type for
    // resolved room id? (that aliases can translate to)
    const policyListRoomId = (await policyListReference.resolve(this.client)).toRoomIdOrAlias();
    const policyList = mjolnir.lists.find(list => list.roomId === policyListRoomId);
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
    const list = mjolnir.resolveListShortcode(designator)
        ?? await mjolnir.defaultPolicylist();
    if (list !== undefined) {
        return CommandResult.Ok(list);
    } else {
        return CommandError.Result(`There is no policy list with the shortcode ${designator} and a default list couldn't be found`);
    }
}

async function ban(
    this: MjolnirContext,
    _keywords: ParsedKeywords,
    policyListReference: MatrixRoomReference|string,
    entity: UserID|MatrixRoomReference|string,
    ...reasonParts: string[]
    ): Promise<CommandResult<any, CommandError>> {
        // first step is to resolve the policy list
        const policyListResult = typeof policyListReference === 'string'
            ? await findPolicyListFromShortcode(this.mjolnir, policyListReference)
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
    paramaters: paramaters([
        {
            name: "list",
            acceptor: union(
                findPresentationType("MatrixRoomReference"),
                findPresentationType("string")
            )
        },
        {
            name: "entity",
            acceptor: union(
                findPresentationType("UserID"),
                findPresentationType("MatrixRoomReference"),
                findPresentationType("string")
            )
        }
    ],
    new RestDescription("reason", findPresentationType("string")),
    ),
    command: ban,
    summary: "Bans an entity from the policy list."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "ban"),
    renderer: tickCrossRenderer
})