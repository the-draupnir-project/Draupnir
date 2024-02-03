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

import { MatrixRoomID, MatrixRoomReference, MjolnirEnabledProtectionsEvent, MjolnirEnabledProtectionsEventType, MjolnirPolicyRoomsConfig, MjolnirProtectedRoomsConfig, MjolnirProtectionSettingsEventType, MjolnirProtectionsConfig, Ok, PolicyListConfig, PolicyRoomManager, ProtectedRoomsConfig, ProtectedRoomsSet, RoomMembershipManager, RoomStateManager, SetMembership, SetRoomState, StandardProtectedRoomsSet, StandardSetMembership, StandardSetRoomState, StringRoomAlias, StringRoomID, StringUserID, isError } from "matrix-protection-suite";
import { BotSDKMatrixAccountData, BotSDKMatrixStateData, BotSDKMjolnirProtectedRoomsStore, BotSDKMjolnirWatchedPolicyRoomsStore, MatrixSendClient, resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DefaultEnabledProtectionsMigration } from "../protections/DefaultEnabledProtectionsMigration";

async function makePolicyListConfig(
    client: MatrixSendClient,
    policyRoomManager: PolicyRoomManager
): Promise<PolicyListConfig> {
    const result = await MjolnirPolicyRoomsConfig.createFromStore(
        new BotSDKMjolnirWatchedPolicyRoomsStore(
            client
        ),
        policyRoomManager,
        { resolveRoom: async (stringReference: StringRoomID | StringRoomAlias) => {
                const reference = MatrixRoomReference.fromRoomIDOrAlias(stringReference);
                const resolvedReference = await resolveRoomReferenceSafe(client, reference);
                if (isError(resolvedReference)) {
                    return resolvedReference;
                } else {
                    return Ok(resolvedReference.ok.toRoomIDOrAlias())
                }
            }
        }
    );
    if (isError(result)) {
        throw result.error;
    }
    return result.ok;
}

async function makeProtectedRoomsConfig(
    client: MatrixSendClient,
): Promise<ProtectedRoomsConfig> {
    const result = await MjolnirProtectedRoomsConfig.createFromStore(
        new BotSDKMjolnirProtectedRoomsStore(
            client
        )
    );
    if (isError(result)) {
        throw result.error;
    }
    return result.ok;
}

async function makeSetMembership(
    roomMembershipManager: RoomMembershipManager,
    protectedRoomsConfig: ProtectedRoomsConfig
): Promise<SetMembership> {
    const membershipSet = await StandardSetMembership.create(
        roomMembershipManager,
        protectedRoomsConfig
    );
    if (isError(membershipSet)) {
        throw membershipSet.error;
    }
    return membershipSet.ok;
}

async function makeSetRoomState(
    roomStateManager: RoomStateManager,
    protectedRoomsConfig: ProtectedRoomsConfig
): Promise<SetRoomState> {
    const setRoomState = await StandardSetRoomState.create(
        roomStateManager,
        protectedRoomsConfig
    );
    if (isError(setRoomState)) {
        throw setRoomState.error;
    }
    return setRoomState.ok;
}

async function makeProtectionConfig(
    client: MatrixSendClient,
    roomStateManager: RoomStateManager,
    managementRoom: MatrixRoomID
) {
    const result = await roomStateManager.getRoomStateRevisionIssuer(
        managementRoom
    );
    if (isError(result)) {
        throw result.error;
    }
    return new MjolnirProtectionsConfig(
        new BotSDKMatrixAccountData<MjolnirEnabledProtectionsEvent>(
            MjolnirEnabledProtectionsEventType,
            MjolnirEnabledProtectionsEvent,
            client
        ),
        new BotSDKMatrixStateData(
            MjolnirProtectionSettingsEventType,
            result.ok,
            client
        ),
        DefaultEnabledProtectionsMigration,
    )
}


export async function makeProtectedRoomsSet(
    managementRoom: MatrixRoomID,
    roomStateManager: RoomStateManager,
    policyRoomManager: PolicyRoomManager,
    roomMembershipManager: RoomMembershipManager,
    client: MatrixSendClient,
    userID: StringUserID
): Promise<ProtectedRoomsSet> {
    const protectedRoomsConfig = await makeProtectedRoomsConfig(client)
    const setRoomState = await makeSetRoomState(
        roomStateManager,
        protectedRoomsConfig
    );
    const membershipSet = await makeSetMembership(
        roomMembershipManager,
        protectedRoomsConfig
    );
    const protectedRoomsSet = new StandardProtectedRoomsSet(
        await makePolicyListConfig(client, policyRoomManager),
        protectedRoomsConfig,
        await makeProtectionConfig(
            client,
            roomStateManager,
            managementRoom
        ),
        membershipSet,
        setRoomState,
        userID,
    );
    return protectedRoomsSet;
}
