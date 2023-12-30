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
    isStringRoomAlias,
    isStringRoomID,
    SetRoomState,
    StandardSetRoomState,
} from "matrix-protection-suite";
import {
    BotSDKMatrixAccountData,
    BotSDKMatrixStateData,
    BotSDKMjolnirProtectedRoomsStore,
    BotSDKMjolnirWatchedPolicyRoomsStore,
    ManagerManager,
    MatrixSendClient,
    SafeMatrixEmitter,
    resolveRoomReferenceSafe
} from 'matrix-protection-suite-for-matrix-bot-sdk';
import { IConfig } from "./config";
import { Draupnir } from "./Draupnir";

/**
 * This is a file for providing default concrete implementations
 * for all things to bootstrap Draupnir in 'bot mode'.
 * However, people should be encouraged to make their own when
 * APIs are stable as the protection-suite makes Draupnir
 * almost completely modular and customizable.
 */

export async function makeDraupnirBotModeFromConfig(
    client: MatrixSendClient,
    matrixEmitter: SafeMatrixEmitter,
    config: IConfig
): Promise<Draupnir> {
    const clientUserId = await client.getUserId();
    if (!isStringUserID(clientUserId)) {
        throw new TypeError(`${clientUserId} is not a valid mxid`);
    }
    if (!isStringRoomAlias(config.managementRoom) || !isStringRoomID(config.managementRoom)) {
        throw new TypeError(`${config.managementRoom} is not a valid room id or alias`);
    }
    const configManagementRoomReference = MatrixRoomReference.fromRoomIDOrAlias(config.managementRoom);
    const managementRoom = await resolveRoomReferenceSafe(client, configManagementRoomReference);
    if (isError(managementRoom)) {
        throw managementRoom.error;
    }
    return await Draupnir.makeDraupnirBot(
        client,
        matrixEmitter,
        clientUserId,
        managementRoom.ok,
        config
    );
}
