// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DefaultEventDecoder, StandardClientsInRoomMap } from 'matrix-protection-suite';
import { BotSDKManualClientProvider } from '../../src/draupnirfactory/BotSDKManualClientProvider';
import { DraupnirFactory } from '../../src/draupnirfactory/DraupnirFactory';
import { ClientCapabilityFactory, RoomStateManagerFactory } from 'matrix-protection-suite-for-matrix-bot-sdk';

// I hate this but whatever.
// We need this so that test clients get access to the room state manager
// factory.
// Again, integration tests need nuking and replacing with dedicated tests
// for commands and glue, seperately.

let clientProvider: BotSDKManualClientProvider | undefined;

export function findBotSDKManualClientProvider(): BotSDKManualClientProvider {
    if (clientProvider === undefined) {
        clientProvider = new BotSDKManualClientProvider();
    }
    return clientProvider;
}

export function destroyBotSDKManualClientProvider(): void {
    clientProvider = undefined;
}

export function makeDraupnirFactoryForIntegrationTest(): DraupnirFactory {
    const clientsInRoomMap = new StandardClientsInRoomMap();
    const roomStateManagerFactory = new RoomStateManagerFactory(
        clientsInRoomMap,
        findBotSDKManualClientProvider().toClientForUserID(),
        DefaultEventDecoder
    );
    const clientCapabilityFactory = new ClientCapabilityFactory(clientsInRoomMap);
    return new DraupnirFactory(
        clientsInRoomMap,
        clientCapabilityFactory,
        findBotSDKManualClientProvider().toClientForUserID(),
        roomStateManagerFactory
    );
}
