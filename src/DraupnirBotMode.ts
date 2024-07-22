// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  isError,
  StringUserID,
  MatrixRoomReference,
  isStringUserID,
  isStringRoomAlias,
  isStringRoomID,
  StandardClientsInRoomMap,
  DefaultEventDecoder,
  setGlobalLoggerProvider,
  RoomStateBackingStore,
} from "matrix-protection-suite";
import {
  BotSDKLogServiceLogger,
  ClientCapabilityFactory,
  MatrixSendClient,
  RoomStateManagerFactory,
  SafeMatrixEmitter,
  resolveRoomReferenceSafe,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import { IConfig } from "./config";
import { Draupnir } from "./Draupnir";
import { DraupnirFactory } from "./draupnirfactory/DraupnirFactory";
import { WebAPIs } from "./webapis/WebAPIs";

setGlobalLoggerProvider(new BotSDKLogServiceLogger());

export function constructWebAPIs(draupnir: Draupnir): WebAPIs {
  return new WebAPIs(draupnir.reportManager, draupnir.config);
}

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
  config: IConfig,
  backingStore?: RoomStateBackingStore
): Promise<Draupnir> {
  const clientUserId = await client.getUserId();
  if (!isStringUserID(clientUserId)) {
    throw new TypeError(`${clientUserId} is not a valid mxid`);
  }
  if (
    !isStringRoomAlias(config.managementRoom) &&
    !isStringRoomID(config.managementRoom)
  ) {
    throw new TypeError(
      `${config.managementRoom} is not a valid room id or alias`
    );
  }
  const configManagementRoomReference = MatrixRoomReference.fromRoomIDOrAlias(
    config.managementRoom
  );
  const managementRoom = await resolveRoomReferenceSafe(
    client,
    configManagementRoomReference
  );
  if (isError(managementRoom)) {
    throw managementRoom.error;
  }
  await client.joinRoom(
    managementRoom.ok.toRoomIDOrAlias(),
    managementRoom.ok.getViaServers()
  );
  const clientsInRoomMap = new StandardClientsInRoomMap();
  const clientProvider = async (userID: StringUserID) => {
    if (userID !== clientUserId) {
      throw new TypeError(`Bot mode shouldn't be requesting any other mxids`);
    }
    return client;
  };
  const roomStateManagerFactory = new RoomStateManagerFactory(
    clientsInRoomMap,
    clientProvider,
    DefaultEventDecoder,
    backingStore
  );
  const clientCapabilityFactory = new ClientCapabilityFactory(
    clientsInRoomMap,
    DefaultEventDecoder
  );
  const draupnirFactory = new DraupnirFactory(
    clientsInRoomMap,
    clientCapabilityFactory,
    clientProvider,
    roomStateManagerFactory
  );
  const draupnir = await draupnirFactory.makeDraupnir(
    clientUserId,
    managementRoom.ok,
    config
  );
  if (isError(draupnir)) {
    const error = draupnir.error;
    throw new Error(`Unable to create Draupnir: ${error.message}`);
  }
  matrixEmitter.on("room.invite", (roomID, event) => {
    clientsInRoomMap.handleTimelineEvent(roomID, event);
  });
  matrixEmitter.on("room.event", (roomID, event) => {
    roomStateManagerFactory.handleTimelineEvent(roomID, event);
    clientsInRoomMap.handleTimelineEvent(roomID, event);
  });
  return draupnir.ok;
}
