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

import { ActionError, ActionResult, MatrixRoomID, Ok, PolicyRuleType, PropagationType, isError } from "matrix-protection-suite";
import { DraupnirContext } from "./CommandHandler";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { ParsedKeywords, findPresentationType, parameters } from "./interface-manager/ParameterParsing";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { listInfo } from "./StatusCommand";
import { Draupnir } from "../Draupnir";

export async function createList(
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    shortcode: string,
    aliasName: string,
): Promise<ActionResult<MatrixRoomID>> {
    const newList = await this.draupnir.policyRoomManager.createPolicyRoom(
        shortcode,
        // avoids inviting ourself and setting 50 as our own powerlevel
        [this.event.sender].filter((sender) => sender !== this.draupnir.clientUserID),
        {
            room_alias_name: aliasName
        }
    );
    if (isError(newList)) {
        return newList;
    }
    const watchResult = await this.draupnir.protectedRoomsSet.issuerManager.watchList(PropagationType.Direct, newList.ok, {});
    if (isError(watchResult)) {
        return watchResult;
    }
    const protectResult = await this.draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(newList.ok);
    if (isError(protectResult)) {
        return protectResult;
    }
    return newList;
}

defineInterfaceCommand({
    designator: ["list", "create"],
    table: "draupnir",
    parameters: parameters([
        {
            name: "shortcode",
            acceptor: findPresentationType("string"),
        },
        {
            name: "alias name",
            acceptor: findPresentationType("string"),
        },
    ]),
    command: createList,
    summary: "Create a new Policy Room which can be used to ban users, rooms and servers from your protected rooms"
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("draupnir", "list", "create"),
    renderer: tickCrossRenderer
})

export async function findPolicyRoomIDFromShortcode(draupnir: Draupnir, shortcode: string): Promise<ActionResult<MatrixRoomID>> {
    const info = await listInfo(draupnir);
    const matchingRevisions = info.filter(list => list.revision.shortcode === shortcode);
    if (matchingRevisions.length === 0 || matchingRevisions[0] === undefined) {
        return ActionError.Result(`Could not find a policy room from the shortcode: ${shortcode}`);
    } else if (matchingRevisions.length === 1) {
        return Ok(matchingRevisions[0].revision.room);
    } else {
        const remainingRevisions = matchingRevisions.filter(revision => revision.revision.isAbleToEdit(draupnir.clientUserID, PolicyRuleType.User));
        if (remainingRevisions.length !== 1 || remainingRevisions[0] === undefined) {
            return ActionError.Result(`The shortcode ${shortcode} is ambiguous and is currently used by ${remainingRevisions.length} lists.`)
        } else {
            return Ok(remainingRevisions[0].revision.room)
        }
    }
}
