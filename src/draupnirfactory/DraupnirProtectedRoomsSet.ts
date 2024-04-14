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

import { ActionResult, ClientPlatform, Logger, MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE, MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE, MatrixRoomID, MissingProtectionCB, MjolnirEnabledProtectionsEvent, MjolnirEnabledProtectionsEventType, MjolnirPolicyRoomsConfig, MjolnirProtectedRoomsConfig, MjolnirProtectedRoomsEvent, MjolnirProtectionSettingsEventType, MjolnirProtectionsConfig, MjolnirWatchedPolicyRoomsEvent, Ok, PolicyListConfig, PolicyRoomManager, ProtectedRoomsConfig, ProtectedRoomsSet, ProtectionsManager, RoomJoiner, RoomMembershipManager, RoomStateManager, SetMembership, SetRoomState, StandardProtectedRoomsSet, StandardProtectionsManager, StandardSetMembership, StandardSetRoomState, StringUserID, isError } from "matrix-protection-suite";
import { BotSDKMatrixAccountData, BotSDKMatrixStateData, MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DefaultEnabledProtectionsMigration } from "../protections/DefaultEnabledProtectionsMigration";
import '../protections/DraupnirProtectionsIndex';

const log = new Logger('DraupnirProtectedRoomsSet');

async function makePolicyListConfig(
    client: MatrixSendClient,
    policyRoomManager: PolicyRoomManager,
    roomJoiner: RoomJoiner,
): Promise<ActionResult<PolicyListConfig>> {
    const result = await MjolnirPolicyRoomsConfig.createFromStore(
        new BotSDKMatrixAccountData(
            MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
            MjolnirWatchedPolicyRoomsEvent,
            client
        ),
        policyRoomManager,
        roomJoiner
    );
    return result;
}

async function makeProtectedRoomsConfig(
    client: MatrixSendClient,
    roomJoiner: RoomJoiner,
): Promise<ActionResult<ProtectedRoomsConfig>> {
    return await MjolnirProtectedRoomsConfig.createFromStore(
        new BotSDKMatrixAccountData(
            MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
            MjolnirProtectedRoomsEvent,
            client
        ),
        roomJoiner
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

function missingProtectionCB(protectionName: string): void {
    log.warn(`Unable to find a protection description for the protection named`, protectionName);
}

// FIXME: https://github.com/the-draupnir-project/Draupnir/issues/338
function makeMissingProtectionCB(): MissingProtectionCB {
    return missingProtectionCB
}

async function makeProtectionsManager(
    client: MatrixSendClient,
    roomStateManager: RoomStateManager,
    managementRoom: MatrixRoomID
): Promise<ActionResult<ProtectionsManager>> {
    const result = await roomStateManager.getRoomStateRevisionIssuer(
        managementRoom
    );
    if (isError(result)) {
        return result;
    }
    const protectionsConfigResult = await MjolnirProtectionsConfig.create(
        new BotSDKMatrixAccountData<MjolnirEnabledProtectionsEvent>(
            MjolnirEnabledProtectionsEventType,
            MjolnirEnabledProtectionsEvent,
            client
        ),
        {
            migrationHandler: DefaultEnabledProtectionsMigration,
            missingProtectionCB: makeMissingProtectionCB()
        }
    );
    if (isError(protectionsConfigResult)) {
        return protectionsConfigResult;
    }
    return Ok(
        new StandardProtectionsManager(
            protectionsConfigResult.ok,
            new BotSDKMatrixStateData(
                MjolnirProtectionSettingsEventType,
                result.ok,
                client
            )
        )
    );
}


export async function makeProtectedRoomsSet(
    managementRoom: MatrixRoomID,
    roomStateManager: RoomStateManager,
    policyRoomManager: PolicyRoomManager,
    roomMembershipManager: RoomMembershipManager,
    client: MatrixSendClient,
    clientPlatform: ClientPlatform,
    userID: StringUserID
): Promise<ActionResult<ProtectedRoomsSet>> {
    const protectedRoomsConfig = await makeProtectedRoomsConfig(client, clientPlatform.toRoomJoiner())
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
    const policyListConfig = await makePolicyListConfig(client, policyRoomManager, clientPlatform.toRoomJoiner());
    if (isError(policyListConfig)) {
        return policyListConfig;
    }
    const protectionsConfig = await makeProtectionsManager(
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
