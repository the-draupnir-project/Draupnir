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

import {
    MjolnirPolicyRoomsConfig,
    PolicyListConfig,
    PolicyRoomManager,
    ProtectedRoomsConfig,
    ResolveRoom,
    MjolnirProtectedRoomsConfig,
    StandardProtectedRoomsSet,
    isError,
    RoomStateManager,
    MjolnirProtectionsConfig,
    MjolnirEnabledProtectionsEvent,
    MjolnirEnabledProtectionsEventType,
    MatrixRoomID,
    MjolnirProtectionSettingsEventType,
    StandardSetMembership,
    RoomMembershipManager,
    SetMembership,
    StringUserID,
    ProtectedRoomsSet,
    MatrixRoomReference,
    isStringUserID,
} from "matrix-protection-suite";
import {
    BotSDKMatrixAccountData,
    BotSDKMatrixStateData,
    BotSDKMjolnirProtectedRoomsStore,
    BotSDKMjolnirWatchedPolicyRoomsStore,
    ManagerManager,
    MatrixSendClient,
    SafeMatrixEmitter
} from 'matrix-protection-suite-for-matrix-bot-sdk';
import { makeStandardConsequenceProvider, renderProtectionFailedToStart } from "./StandardConsequenceProvider";
import { IConfig } from "./config";
import { Draupnir } from "./Draupnir";

/**
 * This is a file for providing default concrete implementations
 * for all things to bootstrap Draupnir in 'bot mode'.
 * However, people should be encouraged to make their own when
 * APIs are stable as the protection-suite makes Draupnir
 * almost completely modular and customizable.
 */

async function makePolicyListConfig(
    client: MatrixSendClient,
    policyRoomManager: PolicyRoomManager
): Promise<PolicyListConfig> {
    const result = await MjolnirPolicyRoomsConfig.createFromStore(
        new BotSDKMjolnirWatchedPolicyRoomsStore(
            client
        ),
        policyRoomManager,
        client as unknown as { resolveRoom: ResolveRoom }
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
        )
    )
}

export async function makeProtectedRoomsSet(
    managementRoom: MatrixRoomID,
    managerManager: ManagerManager,
    client: MatrixSendClient,
    userID: StringUserID
): Promise<ProtectedRoomsSet> {
    const protectedRoomsConfig = await makeProtectedRoomsConfig(client)
    const membershipSet = await makeSetMembership(
        managerManager.roomMembershipManager,
        protectedRoomsConfig
    );
    const protectedRoomsSet = new StandardProtectedRoomsSet(
        await makePolicyListConfig(client, managerManager.policyRoomManager),
        protectedRoomsConfig,
        await makeProtectionConfig(
            client,
            managerManager.roomStateManager,
            managementRoom
        ),
        membershipSet,
        userID,
    );
    return protectedRoomsSet;
}

export async function makeDraupnirBotModeFromConfig(
    client: MatrixSendClient,
    matrixEmitter: SafeMatrixEmitter,
    config: IConfig
): Promise<Draupnir> {
    const clientUserId = await client.getUserId();
    if (!isStringUserID(clientUserId)) {
        throw new TypeError(`${clientUserId} is not a valid mxid`);
    }
    const managementRoom = await MatrixRoomReference.fromRoomIdOrAlias(config.managementRoom).resolve(client as unknown as { resolveRoom: ResolveRoom });
    return await Draupnir.makeDraupnirBot(
        client,
        matrixEmitter,
        clientUserId,
        managementRoom,
        config
    );
}
