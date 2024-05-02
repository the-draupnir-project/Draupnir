/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2020-2021 The Matrix.org Foundation C.I.C.

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

import { ActionResult, MatrixRoomID, MatrixRoomReference, Ok, UserID, isError } from "matrix-protection-suite";
import { DraupnirContext } from "./CommandHandler";
import { ParsedKeywords, RestDescription, findPresentationType, parameters } from "./interface-manager/ParameterParsing";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { defineInterfaceCommand } from "./interface-manager/InterfaceCommand";

async function setPowerLevelCommand(
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    user: UserID,
    powerLevel: string,
    ...givenRooms: MatrixRoomReference[]
): Promise<ActionResult<void>> {
    const parsedLevel = Number.parseInt(powerLevel, 10);
    const resolvedGivenRooms: MatrixRoomID[] = [];
    for (const room of givenRooms) {
        const resolvedResult = await resolveRoomReferenceSafe(this.client, room);
        if (isError(resolvedResult)) {
            return resolvedResult;
        } else {
            resolvedGivenRooms.push(resolvedResult.ok);
        }
    }
    const rooms = givenRooms.length === 0 ? this.draupnir.protectedRoomsSet.allProtectedRooms : resolvedGivenRooms;
    for (const room of rooms) {
        await this.draupnir.client.setUserPowerLevel(user.toString(), room.toRoomIDOrAlias(), parsedLevel);
    }
    return Ok(undefined);
}

defineInterfaceCommand({
    table: "draupnir",
    designator: ["powerlevel"],
    parameters: parameters([
        {
            name: "user",
            acceptor: findPresentationType("UserID")
        },
        {
            name: "power level",
            acceptor: findPresentationType("string")
        }
    ],
    new RestDescription("rooms", findPresentationType("MatrixRoomReference"))),
    command: setPowerLevelCommand,
    summary: "Set the power level of a user across the protected rooms set, or within the provided rooms"
})
