// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ClientPlatform } from "matrix-protection-suite";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  isStringUserID,
  MatrixRoomID,
  MatrixRoomReference,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { makeManagedRoomAccountDataStore } from "./managedRoomAccountData";

export type ManagedRoomBootstrapOptions = {
  managedRoomEnabled: boolean;
  configuredRoom: string | undefined;
  initialManager: StringUserID | undefined;
  clientUserID: StringUserID;
  client: MatrixSendClient;
  clientPlatform: ClientPlatform;
  accountDataEventType: string;
  roomKindDescription: string;
  parseConfiguredRoom(configuredRoom: string): MatrixRoomReference;
  createManagedRoom(
    initialManager: StringUserID,
    clientUserID: StringUserID
  ): Promise<MatrixRoomID>;
};

export async function resolveManagedRoom(
  options: ManagedRoomBootstrapOptions
): Promise<MatrixRoomID> {
  if (options.managedRoomEnabled && options.configuredRoom !== undefined) {
    throw new TypeError(
      `managed ${options.roomKindDescription} mode cannot be used with an explicit ${options.roomKindDescription}; remove the configured room or disable managed mode`
    );
  }

  const roomAccountData = makeManagedRoomAccountDataStore(
    options.client,
    options.accountDataEventType
  );
  const roomResolver = options.clientPlatform.toRoomResolver();
  const roomJoiner = options.clientPlatform.toRoomJoiner();

  if (options.managedRoomEnabled) {
    const storedRoom = (await roomAccountData.requestAccountData()).expect(
      `Unable to read managed ${options.roomKindDescription} account data`
    );
    if (storedRoom !== undefined) {
      const roomReference = MatrixRoomReference.fromRoomID(storedRoom.room_id);
      const room = (await roomResolver.resolveRoom(roomReference)).expect(
        `Unable to resolve managed Draupnir ${options.roomKindDescription}`
      );
      (await roomJoiner.joinRoom(room)).expect(
        `Unable to join managed Draupnir ${options.roomKindDescription}`
      );
      return room;
    }

    if (options.initialManager === undefined) {
      throw new TypeError(
        `managed ${options.roomKindDescription} mode is enabled but initialManager is not configured`
      );
    }
    if (!isStringUserID(options.initialManager)) {
      throw new TypeError(
        `${options.initialManager} is not a valid initial manager mxid`
      );
    }

    const createdRoom = await options.createManagedRoom(
      options.initialManager,
      options.clientUserID
    );
    (
      await roomAccountData.storeAccountData({
        room_id: createdRoom.toRoomIDOrAlias(),
      })
    ).expect(`Unable to persist managed ${options.roomKindDescription}`);
    return createdRoom;
  }

  if (options.configuredRoom === undefined) {
    throw new TypeError(
      `${options.roomKindDescription} is required when managed ${options.roomKindDescription} mode is disabled`
    );
  }

  const configuredRoomReference = options.parseConfiguredRoom(
    options.configuredRoom
  );
  const configuredRoom = (
    await roomResolver.resolveRoom(configuredRoomReference)
  ).expect(`Unable to resolve Draupnir's ${options.roomKindDescription}`);
  (await roomJoiner.joinRoom(configuredRoom)).expect(
    `Unable to join Draupnir's ${options.roomKindDescription}`
  );
  return configuredRoom;
}
