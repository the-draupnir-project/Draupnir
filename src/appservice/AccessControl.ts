/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2022 The Matrix.org Foundation C.I.C.

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

import { Bridge } from "matrix-appservice-bridge";
import { Permalinks } from "../commands/interface-manager/Permalinks";
import AccessControlUnit, { EntityAccess } from "../models/AccessControlUnit";
import { EntityType, Recommendation } from "../models/ListRule";
import PolicyList from "../models/PolicyList";
import { trace, traceSync } from "../utils";

/**
 * Utility to manage which users have access to the application service,
 * meaning whether a user is able to provision a mjolnir or continue to use one.
 * Internally we use a policy list within matrix to determine who has access via the `AccessControlUnit`.
 */
export class AccessControl {

    private constructor(
        private readonly accessControlList: PolicyList,
        private readonly accessControlUnit: AccessControlUnit
    ) {
    }

    /**
     * Construct and initialize access control for the `MjolnirAppService`.
     * @param accessControlListId The room id of a policy list used to manage access to the appservice (who can provision & use mjolniren)
     * @param bridge The matrix-appservice-bridge, used to get the appservice bot.
     * @returns A new instance of `AccessControl` to be used by `MjolnirAppService`.
     */
    @trace('AccessControl.setupAccessControl')
    public static async setupAccessControl(
        /** The room id for the access control list. */
        accessControlListId: string,
        bridge: Bridge,
    ): Promise<AccessControl> {
        await bridge.getBot().getClient().joinRoom(accessControlListId);
        const accessControlList = new PolicyList(
            accessControlListId,
            Permalinks.forRoom(accessControlListId),
            bridge.getBot().getClient()
        );
        const accessControlUnit = new AccessControlUnit([accessControlList]);
        await accessControlList.updateList();
        return new AccessControl(accessControlList, accessControlUnit);
    }

    @traceSync('AccessControl.handleEvent')
    public handleEvent(roomId: string, event: any) {
        if (roomId === this.accessControlList.roomId) {
            this.accessControlList.updateForEvent(event);
        }
    }

    @traceSync('AccessControl.getUserAccess')
    public getUserAccess(mxid: string): EntityAccess {
        return this.accessControlUnit.getAccessForUser(mxid, "CHECK_SERVER");
    }

    @trace('AccessControl.allow')
    public async allow(mxid: string): Promise<void> {
        await this.accessControlList.createPolicy(EntityType.RULE_USER, Recommendation.Allow, mxid);
    }

    @trace('AccessControl.remove')
    public async remove(mxid: string): Promise<void> {
        await this.accessControlList.unbanEntity(EntityType.RULE_USER, mxid);
    }
}
