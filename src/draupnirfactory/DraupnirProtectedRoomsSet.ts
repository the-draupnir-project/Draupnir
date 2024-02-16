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

import { ActionResult, MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE, MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE, MatrixRoomID, MatrixRoomReference, MjolnirEnabledProtectionsEvent, MjolnirEnabledProtectionsEventType, MjolnirPolicyRoomsConfig, MjolnirProtectedRoomsConfig, MjolnirProtectedRoomsEvent, MjolnirProtectionSettingsEventType, MjolnirProtectionsConfig, MjolnirWatchedPolicyRoomsEvent, Ok, PolicyListConfig, PolicyRoomManager, ProtectedRoomsConfig, ProtectedRoomsSet, ProtectionsConfig, RoomMembershipManager, RoomStateManager, SetMembership, SetRoomState, StandardProtectedRoomsSet, StandardSetMembership, StandardSetRoomState, StringRoomAlias, StringRoomID, StringUserID, isError } from "matrix-protection-suite";
import { BotSDKMatrixAccountData, BotSDKMatrixStateData, MatrixSendClient, resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DefaultEnabledProtectionsMigration } from "../protections/DefaultEnabledProtectionsMigration";
import '../protections/DraupnirProtectionsIndex';

async function makePolicyListConfig(
    client: MatrixSendClient,
    policyRoomManager: PolicyRoomManager
): Promise<ActionResult<PolicyListConfig>> {
    const result = await MjolnirPolicyRoomsConfig.createFromStore(
        new BotSDKMatrixAccountData(
            MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
            MjolnirWatchedPolicyRoomsEvent,
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
    return result;
}

async function makeProtectedRoomsConfig(
    client: MatrixSendClient,
): Promise<ActionResult<ProtectedRoomsConfig>> {
    return await MjolnirProtectedRoomsConfig.createFromStore(
        new BotSDKMatrixAccountData(
            MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
            MjolnirProtectedRoomsEvent,
            client
        )
    );
}

async function makeSetMembership(
    roomMembershipManager: RoomMembershipManager,
    protectedRoomsConfig: ProtectedRoomsConfig
): Promise<ActionResult<SetMembership>> {
    return await StandardSetMembership.create(
        roomMembershipManager,
        protectedRoomsConfig
    );
}

async function makeSetRoomState(
    roomStateManager: RoomStateManager,
    protectedRoomsConfig: ProtectedRoomsConfig
): Promise<ActionResult<SetRoomState>> {
    return await StandardSetRoomState.create(
        roomStateManager,
        protectedRoomsConfig
    );
}

async function makeProtectionConfig(
    client: MatrixSendClient,
    roomStateManager: RoomStateManager,
    managementRoom: MatrixRoomID
): Promise<ActionResult<ProtectionsConfig>> {
    const result = await roomStateManager.getRoomStateRevisionIssuer(
        managementRoom
    );
    if (isError(result)) {
        return result;
    }
    return Ok(new MjolnirProtectionsConfig(
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
    ));
}


export async function makeProtectedRoomsSet(
    managementRoom: MatrixRoomID,
    roomStateManager: RoomStateManager,
    policyRoomManager: PolicyRoomManager,
    roomMembershipManager: RoomMembershipManager,
    client: MatrixSendClient,
    userID: StringUserID
): Promise<ActionResult<ProtectedRoomsSet>> {
    const protectedRoomsConfig = await makeProtectedRoomsConfig(client)
    if (isError(protectedRoomsConfig)) {
        return protectedRoomsConfig;
    }
    const setRoomState = await makeSetRoomState(
        roomStateManager,
        protectedRoomsConfig.ok
    );
    if (isError(setRoomState)) {
        return setRoomState;
    }
    const membershipSet = await makeSetMembership(
        roomMembershipManager,
        protectedRoomsConfig.ok
    );
    if (isError(membershipSet)) {
        return membershipSet;
    }
    const policyListConfig = await makePolicyListConfig(client, policyRoomManager);
    if (isError(policyListConfig)) {
        return policyListConfig;
    }
    const protectionsConfig = await makeProtectionConfig(
        client,
        roomStateManager,
        managementRoom
    );
    if (isError(protectionsConfig)) {
        return protectionsConfig;
    }
    const protectedRoomsSet = new StandardProtectedRoomsSet(
        policyListConfig.ok,
        protectedRoomsConfig.ok,
        protectionsConfig.ok,
        membershipSet.ok,
        setRoomState.ok,
        userID,
    );
    return Ok(protectedRoomsSet);
}
