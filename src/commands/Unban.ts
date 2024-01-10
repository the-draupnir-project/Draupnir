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
import { findPresentationType, KeywordsDescription, parameters, ParsedKeywords, union } from "./interface-manager/ParameterParsing";
import { UserID, MatrixGlob, LogLevel } from "matrix-bot-sdk";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { Draupnir } from "../Draupnir";
import { ActionResult, isError, isStringUserID, MatrixRoomReference, Ok, PolicyRuleType } from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

async function unbanUserFromRooms(draupnir: Draupnir, rule: MatrixGlob) {
    await draupnir.managementRoomOutput.logMessage(LogLevel.INFO, "Unban", "Unbanning users that match glob: " + rule.regex);
    for (const revision of draupnir.protectedRoomsSet.setMembership.allRooms) {
        for (const member of revision.members()) {
            if (member.membership !== 'ban') {
                continue;
            }
            if (rule.test(member.userID)) {
                await draupnir.managementRoomOutput.logMessage(LogLevel.DEBUG, "Unban", `Unbanning ${member.userID} in ${revision.room.toRoomIDOrAlias()}`, revision.room.toRoomIDOrAlias());
                if (!draupnir.config.noop) {
                    await draupnir.client.unbanUser(member.userID, revision.room.toRoomIDOrAlias());
                } else {
                    await draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "Unban", `Attempted to unban ${member.userID} in ${revision.room.toRoomIDOrAlias()} but Mjolnir is running in no-op mode`, revision.room.toRoomIDOrAlias());
                }
            }
        }
    }
}

async function unban(
    this: DraupnirContext,
    keywords: ParsedKeywords,
    entity: UserID|MatrixRoomReference|string,
    policyRoomReference: MatrixRoomReference,
): Promise<ActionResult<void>> {
    const policyRoom = await resolveRoomReferenceSafe(this.client, policyRoomReference);
    if (isError(policyRoom)) {
        return policyRoom;
    }
    const policyRoomEditor = await this.draupnir.policyRoomManager.getPolicyRoomEditor(
        policyRoom.ok
    );
    if (isError(policyRoomEditor)) {
        return policyRoomEditor;
    }
    const policyRoomUnban = entity instanceof UserID
        ? await policyRoomEditor.ok.unbanEntity(PolicyRuleType.User, entity.toString())
        : typeof entity === 'string'
        ? await policyRoomEditor.ok.unbanEntity(PolicyRuleType.Server, entity)
        : await (async () => {
            const bannedRoom = await resolveRoomReferenceSafe(this.client, entity);
            if (isError(bannedRoom)) {
                return bannedRoom;
            }
            return await policyRoomEditor.ok.unbanEntity(PolicyRuleType.Room, bannedRoom.ok.toRoomIDOrAlias());
        })();
    if (isError(policyRoomUnban)) {
        return policyRoomUnban;
    }
    if (typeof entity === 'string' || entity instanceof UserID) {
        const rawEnttiy = typeof entity === 'string' ? entity : entity.toString();
        const isGlob = (string: string) => string.includes('*') ? true : string.includes('?');
        const rule = new MatrixGlob(entity.toString())
        if (isStringUserID(rawEnttiy)) {
            this.draupnir.unlistedUserRedactionQueue.removeUser(rawEnttiy);
        }
        if (!isGlob(rawEnttiy) || keywords.getKeyword<string>("true", "false") === "true") {
            await unbanUserFromRooms(this.draupnir, rule);
        } else {
            await this.draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "Unban", "Running unban without `unban <list> <user> true` will not override existing room level bans");
        }
    }

    return Ok(undefined);
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
            ),
            prompt: async function (this: DraupnirContext) {
                return {
                    suggestions: this.draupnir.policyRoomManager.getEditablePolicyRoomIDs(
                        this.draupnir.clientUserID,
                        PolicyRuleType.User
                    )
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
