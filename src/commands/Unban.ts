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
import { MatrixRoomReference } from "./interface-manager/MatrixRoomReference";
import { findPresentationType, KeywordsDescription, parameters, ParsedKeywords, union } from "./interface-manager/ParameterParsing";
import { UserID, MatrixGlob, LogLevel } from "matrix-bot-sdk";
import { CommandError, CommandResult } from "./interface-manager/Validation";
import { findPolicyListFromRoomReference, findPolicyListFromShortcode } from "./Ban";
import { RULE_ROOM, RULE_SERVER, RULE_USER } from "../models/ListRule";
import { Mjolnir } from "../Mjolnir";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import PolicyList from "../models/PolicyList";

async function unbanUserFromRooms(mjolnir: Mjolnir, rule: MatrixGlob) {
    await mjolnir.managementRoomOutput.logMessage(LogLevel.INFO, "Unban", "Unbanning users that match glob: " + rule.regex);
    let unbannedSomeone = false;
    for (const protectedRoomId of mjolnir.protectedRoomsTracker.getProtectedRooms()) {
        const members = await mjolnir.client.getRoomMembers(protectedRoomId, undefined, ['ban'], undefined);
        await mjolnir.managementRoomOutput.logMessage(LogLevel.DEBUG, "Unban", `Found ${members.length} banned user(s)`);
        for (const member of members) {
            const victim = member.membershipFor;
            if (member.membership !== 'ban') continue;
            if (rule.test(victim)) {
                await mjolnir.managementRoomOutput.logMessage(LogLevel.DEBUG, "Unban", `Unbanning ${victim} in ${protectedRoomId}`, protectedRoomId);

                if (!mjolnir.config.noop) {
                    await mjolnir.client.unbanUser(victim, protectedRoomId);
                } else {
                    await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, "Unban", `Attempted to unban ${victim} in ${protectedRoomId} but Mjolnir is running in no-op mode`, protectedRoomId);
                }

                unbannedSomeone = true;
            }
        }
    }

    if (unbannedSomeone) {
        await mjolnir.managementRoomOutput.logMessage(LogLevel.DEBUG, "Unban", `Syncing lists to ensure no users were accidentally unbanned`);
        await mjolnir.protectedRoomsTracker.syncLists();
    }
}

async function unban(
    this: DraupnirContext,
    keywords: ParsedKeywords,
    entity: UserID|MatrixRoomReference|string,
    policyListReference: MatrixRoomReference|string,
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

    if (entity instanceof UserID) {
        await policyList.unbanEntity(RULE_USER, entity.toString());
    } else if (entity instanceof MatrixRoomReference) {
        await policyList.unbanEntity(RULE_ROOM, entity.toRoomIdOrAlias());
    } else {
        await policyList.unbanEntity(RULE_SERVER, entity);
    }

    if (typeof entity === 'string' || entity instanceof UserID) {
        const rawEnttiy = typeof entity === 'string' ? entity : entity.toString();
        const isGlob = (string: string) => string.includes('*') ? true : string.includes('?');
        const rule = new MatrixGlob(entity.toString())
        this.mjolnir.unlistedUserRedactionHandler.removeUser(entity.toString());
        if (!isGlob(rawEnttiy) || keywords.getKeyword<string>("true", "false") === "true") {
            await unbanUserFromRooms(this.mjolnir, rule);
        } else {
            await this.mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, "Unban", "Running unban without `unban <list> <user> true` will not override existing room level bans");
        }
    }

    return CommandResult.Ok(undefined);
}

defineInterfaceCommand({
    designator: ["unban"],
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
            prompt: async function (this: DraupnirContext) {
                return {
                    suggestions: this.mjolnir.policyListManager.lists
                };
            }
        },
    ],
    undefined,
    new KeywordsDescription({
        true: {
            name: "true",
            isFlag: true,
            acceptor: findPresentationType("boolean"),
        }
    })
    ),
    command: unban,
    summary: "Removes an entity from a policy list. If the entity is a glob, then the flag --true must be provided to unban users matching the glob from all protected rooms."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "unban"),
    renderer: tickCrossRenderer
})
