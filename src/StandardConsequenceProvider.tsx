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

import { ActionError, ActionException, ActionExceptionKind, ActionResult, ConsequenceProvider, Ok, Permalinks, ProtectionDescription, ProtectionDescriptionInfo, SetMemberBanResultMap, StringEventID, StringRoomID, StringUserID, Task, applyPolicyRevisionToSetMembership } from "matrix-protection-suite";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { renderMatrixAndSend } from "./commands/interface-manager/DeadDocumentMatrix";
import { JSXFactory } from "./commands/interface-manager/JSXFactory";
import { DocumentNode } from "./commands/interface-manager/DeadDocument";

interface ProviderContext {
    client: MatrixSendClient;
    managementRoomID: StringRoomID;
}

async function renderConsequenceForEvent(client: MatrixSendClient, managementRoomID: StringRoomID, protection: ProtectionDescriptionInfo, roomID: StringRoomID, eventID: StringEventID, reason: string): Promise<ActionResult<void>> {
    await renderMatrixAndSend(
        <root>
            Protection {protection.name}: Redacting event {Permalinks.forEvent(roomID, eventID)} for {reason}.
        </root>,
        managementRoomID,
        undefined,
        client
    )
    return Ok(undefined);
}

const consequenceForEvent: ConsequenceProvider['consequenceForEvent'] = async function(
    this: ProviderContext, protection, roomID, eventID, reason
): Promise<ActionResult<void>> {
    Task(renderConsequenceForEvent(this.client, this.managementRoomID, protection, roomID, eventID, reason))
    return this.client.redactEvent(roomID, eventID, reason).then(
        (_) => Ok(undefined),
        (exception) => ActionException.Result(
            `Unable to redact the event ${eventID} when enforcing a consequence`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    )
}

async function renderConsequenceForUserInRoom(client: MatrixSendClient, managementRoomID: StringRoomID, protection: ProtectionDescriptionInfo, roomID: StringRoomID, userID: StringUserID, reason: string): Promise<ActionResult<void>> {
    await renderMatrixAndSend(
        <root>
            Protection: {protection.name}: Banning user {userID} in {Permalinks.forRoom(roomID)} for {reason}.
        </root>,
        managementRoomID,
        undefined,
        client
    );
    return Ok(undefined);
}

function banUser(client: MatrixSendClient, protection: ProtectionDescriptionInfo, roomID: StringRoomID, userID: StringUserID, reason: string): Promise<ActionResult<void>> {
    return client.banUser(
        userID, roomID, reason
    ).then(
        (_) => Ok(undefined),
        (exception) => ActionException.Result(
            `Unable to ban the user ${userID} in ${roomID} when enforcing a consequence`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    )
}

const consequenceForUserInRoom: ConsequenceProvider['consequenceForUserInRoom'] = async function(
    this: ProviderContext, protection, roomID, userID, reason
): Promise<ActionResult<void>> {
    Task(renderConsequenceForUserInRoom(this.client, this.managementRoomID, protection, roomID, userID, reason));
    return banUser(this.client, protection, roomID, userID, reason);
}

function renderSetMembershipBans(title: DocumentNode, map: SetMemberBanResultMap): DocumentNode {
    return <fragment>
        {title},
        {
            [...map.entries()].map(([userID, roomResults]) => {
                return <details>
                    <summary>{userID} will be banned from {roomResults.size} rooms.</summary>
                    <ul>{[...roomResults.entries()].map((roomID) => {
                    return <li>{roomID}</li>
                })}</ul>
                </details>
            })
        }
    </fragment>
}

const consequenceForUsersInRevision: ConsequenceProvider['consequenceForUsersInRevision'] = async function(
    this: ProviderContext, description, setMembership, revision
) {
    const results = await applyPolicyRevisionToSetMembership(
        description,
        revision,
        setMembership,
        (_description, roomID, userID, reason) => banUser(this.client, description, roomID, userID, reason)
    );
    Task(renderMatrixAndSend(
        renderSetMembershipBans(
            <span>Banning {results.size} users in protected rooms.</span>,
            results
        ),
        this.managementRoomID,
        undefined,
        this.client
    ).then((_) => Ok(undefined)))
    return Ok(undefined);
}

const consequenceForServerACL: ConsequenceProvider['consequenceForServerACL'] = async function(
    this: ProviderContext, aclContent
): Promise<ActionResult<void>> {
    // nothing to do
    return Ok(undefined)
}

const consequenceForServerACLInRoom: ConsequenceProvider['consequenceForServerACLInRoom'] = async function(
    this: ProviderContext, _protection, roomID, aclContent
): Promise<ActionResult<void>> {
    return this.client.sendStateEvent(roomID, 'm.room.server_acl', '', aclContent).then(
        (_) => Ok(undefined),
        (exception) => ActionException.Result(
            `Unable to set the server ACL in the room ${roomID}`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    )
}

const consequenceForServerInRoom: ConsequenceProvider['consequenceForServerInRoom'] = async function(
) {
    return Ok(undefined);
}

export function makeStandardConsequenceProvider(
    client: MatrixSendClient,
    managementRoomID: StringRoomID
): ConsequenceProvider {
    return {
        consequenceForEvent,
        consequenceForServerACL,
        consequenceForUserInRoom,
        consequenceForServerACLInRoom,
        consequenceForServerInRoom,
        consequenceForUsersInRevision,
        client,
        managementRoomID
    } as unknown as ConsequenceProvider;
}

export async function renderProtectionFailedToStart(
    client: MatrixSendClient,
    managementRoomID: StringRoomID,
    error: ActionError,
    protectionDescription?: ProtectionDescription
): Promise<void> {
    await renderMatrixAndSend(
        <root>
            <span>A protection {protectionDescription?.name} failed to start for the following reason:</span>
            <span>{error.message}</span>
        </root>,
        managementRoomID,
        undefined,
        client
    )
}
