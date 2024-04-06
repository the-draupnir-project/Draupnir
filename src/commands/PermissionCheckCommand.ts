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

import { ActionError, ActionResult } from "matrix-protection-suite";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { ParsedKeywords, parameters } from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";

defineInterfaceCommand({
    designator: ["verify"],
    table: "mjolnir",
    parameters: parameters([]),
    command: async function (this: DraupnirContext, _keywords: ParsedKeywords): Promise<ActionResult<unknown>> {
        const enabledProtection = this.draupnir.protectedRoomsSet.protections.allProtections;
        const eventPermissions = new Set<string>();
        const permissions = new Set<string>();
        for (const proteciton of enabledProtection) {
            proteciton.requiredEventPermissions.forEach(permission => eventPermissions.add(permission));
            proteciton.requiredPermissions.forEach(permission => permissions.add(permission));
        }
        // FIXME do we need something like setMembership but for room state?
        // Not sure if it will work because sometimes you need room state of watched lists too.
        // Should be considered with the appservice to effect visibility of rooms.
        return ActionError.Result(`Unimplemented`);
    },
    summary: "Verify the permissions that draupnir has."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "verify"),
    renderer: tickCrossRenderer
})
