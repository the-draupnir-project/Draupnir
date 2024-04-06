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

import { ActionResult, EntityAccess, MatrixRoomID, Ok, PolicyListRevisionIssuer, PolicyRoomManager, StringUserID, isError, AccessControl as MPSAccess, PolicyRoomEditor, PolicyRuleType, Recommendation, RoomJoiner } from "matrix-protection-suite";

/**
 * Utility to manage which users have access to the application service,
 * meaning whether a user is able to provision a mjolnir or continue to use one.
 * Internally we use a policy list within matrix to determine who has access via the `AccessControlUnit`.
 */
export class AccessControl {

    private constructor(
        private readonly accessControlRevisionIssuer: PolicyListRevisionIssuer,
        private readonly editor: PolicyRoomEditor
    ) {
        // nothing to do.
    }

    /**
     * Construct and initialize access control for the `MjolnirAppService`.
     * @param accessControlListId The room id of a policy list used to manage access to the appservice (who can provision & use mjolniren)
     * @param bridge The matrix-appservice-bridge, used to get the appservice bot.
     * @returns A new instance of `AccessControl` to be used by `MjolnirAppService`.
     */
    public static async setupAccessControlForRoom(
        /** The room id for the access control list. */
        accessControlRoom: MatrixRoomID,
        policyRoomManager: PolicyRoomManager,
        bridgeBotJoiner: RoomJoiner,
    ): Promise<ActionResult<AccessControl>> {
        const joinResult = await bridgeBotJoiner.joinRoom(accessControlRoom.toRoomIDOrAlias());
        if (isError(joinResult)) {
            return joinResult;
        }
        const revisionIssuer = await policyRoomManager.getPolicyRoomRevisionIssuer(accessControlRoom);
        if (isError(revisionIssuer)) {
            return revisionIssuer;
        }
        const editor = await policyRoomManager.getPolicyRoomEditor(accessControlRoom);
        if (isError(editor)) {
            return editor;
        }
        return Ok(new AccessControl(revisionIssuer.ok, editor.ok));
    }

    public getUserAccess(mxid: StringUserID): EntityAccess {
        return MPSAccess.getAccessForUser(this.accessControlRevisionIssuer.currentRevision, mxid, "CHECK_SERVER");
    }

    public async allow(mxid: StringUserID, reason = "<no reason supplied>"): Promise<ActionResult<void>> {
        const result = await this.editor.createPolicy(PolicyRuleType.User, Recommendation.Allow, mxid, reason, {});
        if (isError(result)) {
            return result
        } else {
            return Ok(undefined);
        }
    }

    public async remove(mxid: StringUserID): Promise<ActionResult<void>> {
        const result = await this.editor.unbanEntity(PolicyRuleType.User, mxid);
        if (isError(result)) {
            return result;
        } else {
            return Ok(undefined);
        }
    }
}
