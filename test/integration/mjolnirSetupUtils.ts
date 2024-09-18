// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  MatrixClient,
  PantalaimonClient,
  MemoryStorageProvider,
  LogService,
  LogLevel,
  RichConsoleLogger,
} from "matrix-bot-sdk";
import { overrideRatelimitForUser, registerUser } from "./clientHelper";
import { initializeSentry, patchMatrixClient } from "../../src/utils";
import { IConfig } from "../../src/config";
import { Draupnir } from "../../src/Draupnir";
import { DraupnirBotModeToggle } from "../../src/DraupnirBotMode";
import {
  SafeMatrixEmitter,
  SafeMatrixEmitterWrapper,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  DefaultEventDecoder,
  MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
  MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
  RoomStateBackingStore,
} from "matrix-protection-suite";
import { WebAPIs } from "../../src/webapis/WebAPIs";

patchMatrixClient();

// they are add [key: string]: any to their interface, amazing.
export type SafeMochaContext = Pick<
  Mocha.Context,
  | "test"
  | "currentTest"
  | "runnable"
  | "timeout"
  | "slow"
  | "skip"
  | "retries"
  | "done"
>;

export interface DraupnirTestContext extends SafeMochaContext {
  draupnir?: Draupnir;
  managementRoomAlias?: string;
  apis?: WebAPIs;
  config: IConfig;
}

/**
 * Ensures that a room exists with the alias, if it does not exist we create it.
 * @param client The MatrixClient to use to resolve or create the aliased room.
 * @param alias The alias of the room.
 * @returns The room ID of the aliased room.
 */
export async function ensureAliasedRoomExists(
  client: MatrixClient,
  alias: string
): Promise<string> {
  try {
    return await client.resolveRoom(alias);
  } catch (e) {
    if (e?.body?.errcode === "M_NOT_FOUND") {
      console.info(`${alias} hasn't been created yet, so we're making it now.`);
      const roomId = await client.createRoom({
        visibility: "public",
      });
      await client.createRoomAlias(alias, roomId);
      return roomId;
    }
    throw e;
  }
}

async function configureMjolnir(config: IConfig) {
  // Initialize error monitoring as early as possible.
  initializeSentry(config);
  try {
    await registerUser(
      config.homeserverUrl,
      config.pantalaimon.username,
      config.pantalaimon.username,
      config.pantalaimon.password,
      true
    );
  } catch (e) {
    if (e?.body?.errcode === "M_USER_IN_USE") {
      console.log(
        `${config.pantalaimon.username} already registered, skipping`
      );
      return;
    }
    throw e;
  }
}

export function draupnir(): Draupnir | null {
  return globalMjolnir;
}
export function draupnirClient(): MatrixClient | null {
  return globalClient;
}
export function draupnirSafeEmitter(): SafeMatrixEmitter {
  if (globalSafeEmitter !== undefined) {
    return globalSafeEmitter;
  }
  throw new TypeError(`Setup code didn't run properly`);
}
let globalClient: MatrixClient | null;
let globalMjolnir: Draupnir | null;
let globalSafeEmitter: SafeMatrixEmitter | undefined;

/**
 * Return a test instance of Mjolnir.
 */
export async function makeMjolnir(
  config: IConfig,
  {
    backingStore,
    eraseAccountData,
  }: { backingStore?: RoomStateBackingStore; eraseAccountData?: boolean } = {}
): Promise<Draupnir> {
  await configureMjolnir(config);
  LogService.setLogger(new RichConsoleLogger());
  LogService.setLevel(LogLevel.fromString(config.logLevel, LogLevel.DEBUG));
  LogService.info("test/mjolnirSetupUtils", "Starting bot...");
  const pantalaimon = new PantalaimonClient(
    config.homeserverUrl,
    new MemoryStorageProvider()
  );
  const client = await pantalaimon.createClientWithCredentials(
    config.pantalaimon.username,
    config.pantalaimon.password
  );
  if (eraseAccountData) {
    await Promise.all([
      client.setAccountData(MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE, { rooms: [] }),
      client.setAccountData(MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE, {
        references: [],
      }),
    ]);
  }
  await overrideRatelimitForUser(
    config.homeserverUrl,
    await client.getUserId()
  );
  await ensureAliasedRoomExists(client, config.managementRoom);
  const toggle = await DraupnirBotModeToggle.create(
    client,
    new SafeMatrixEmitterWrapper(client, DefaultEventDecoder),
    config,
    backingStore
  );
  const mj = (await toggle.switchToDraupnir()).expect(
    "Could not create Draupnir"
  );
  globalClient = client;
  globalMjolnir = mj;
  globalSafeEmitter = new SafeMatrixEmitterWrapper(client, DefaultEventDecoder);
  return mj;
}

/**
 * Remove the alias and leave the room, can't be implicitly provided from the config because Mjolnir currently mutates it.
 * @param client The client to use to leave the room.
 * @param roomId The roomId of the room to leave.
 * @param alias The alias to remove from the room.
 */
export async function teardownManagementRoom(
  client: MatrixClient,
  roomId: string,
  alias: string
) {
  await client.deleteRoomAlias(alias);
  await client.leaveRoom(roomId);
}
