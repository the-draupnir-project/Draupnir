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

import { DraupnirContext } from "./CommandHandler";
import { defineInterfaceCommand,findTableCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, ParameterDescription, parameters, ParsedKeywords, RestDescription, union } from "./interface-manager/ParameterParsing";
import "./interface-manager/MatrixPresentations";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { PromptOptions } from "./interface-manager/PromptForAccept";
import { Draupnir } from "../Draupnir";
import { ActionResult, MatrixRoomReference, PolicyRoomEditor, PolicyRuleType, isError, UserID, Ok } from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { findPolicyRoomIDFromShortcode } from "./CreateBanListCommand";


export async function findPolicyRoomEditorFromRoomReference(draupnir: Draupnir, policyRoomReference: MatrixRoomReference): Promise<ActionResult<PolicyRoomEditor>> {
    const policyRoomID = await resolveRoomReferenceSafe(draupnir.client, policyRoomReference);
    if (isError(policyRoomID)) {
        return policyRoomID;
    }
    return await draupnir.policyRoomManager.getPolicyRoomEditor(policyRoomID.ok);
}

async function ban(
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    entity: UserID|MatrixRoomReference|string,
    policyRoomDesignator: MatrixRoomReference|string,
    ...reasonParts: string[]
): Promise<ActionResult<string>> {
    const policyRoomReference = typeof policyRoomDesignator === 'string'
        ? await findPolicyRoomIDFromShortcode(this.draupnir, policyRoomDesignator)
        : Ok(policyRoomDesignator);
    if (isError(policyRoomReference)) {
        return policyRoomReference;
    }
    const policyListEditorResult = await findPolicyRoomEditorFromRoomReference(
        this.draupnir,
        policyRoomReference.ok
    );
    if (isError(policyListEditorResult)) {
        return policyListEditorResult;
    }
    const policyListEditor = policyListEditorResult.ok;
    const reason = reasonParts.join(' ');
    if (entity instanceof UserID) {
        return await policyListEditor.banEntity(PolicyRuleType.User, entity.toString(), reason);
    } else if (typeof entity === 'string') {
        return await policyListEditor.banEntity(PolicyRuleType.Server,entity, reason);
    } else {
        const resolvedRoomReference = await resolveRoomReferenceSafe(
            this.draupnir.client,
            entity
        );
        if (isError(resolvedRoomReference)) {
            return resolvedRoomReference;
        }
        return await policyListEditor.banEntity(PolicyRuleType.Server, resolvedRoomReference.ok.toRoomIDOrAlias(), reason);
    }
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
                findPresentationType("string")
            ),
            prompt: async function (this: DraupnirContext, _parameter: ParameterDescription): Promise<PromptOptions> {
                return {
                    suggestions: this.draupnir.policyRoomManager.getEditablePolicyRoomIDs(
                        this.draupnir.clientUserID,
                        PolicyRuleType.User
                    )
                };
            }
        },
    ],
    new RestDescription<DraupnirContext>(
        "reason",
        findPresentationType("string"),
        async function(_parameter) {
            return {
                suggestions: this.draupnir.config.commands.ban.defaultReasons
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
