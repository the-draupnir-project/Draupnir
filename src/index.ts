// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019, 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import * as path from "path";

import { Healthz } from "./health/healthz";

import {
  LogLevel,
  LogService,
  MatrixClient,
  PantalaimonClient,
  RichConsoleLogger,
  SimpleFsStorageProvider,
  RustSdkCryptoStorageProvider,
} from "matrix-bot-sdk";
import { StoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";
import { read as configRead } from "./config";
import { initializeSentry, patchMatrixClient } from "./utils";
import {
  constructWebAPIs,
  makeDraupnirBotModeFromConfig,
} from "./DraupnirBotMode";
import { Draupnir } from "./Draupnir";
import { SafeMatrixEmitterWrapper } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DefaultEventDecoder } from "matrix-protection-suite";
import { WebAPIs } from "./webapis/WebAPIs";
import { SqliteRoomStateBackingStore } from "./backingstore/better-sqlite3/SqliteRoomStateBackingStore";

void (async function () {
  const config = configRead();

  config.RUNTIME = {};

  LogService.setLogger(new RichConsoleLogger());
  LogService.setLevel(LogLevel.fromString(config.logLevel, LogLevel.DEBUG));

  LogService.info("index", "Starting bot...");

  // Initialize error reporting as early as possible.
  if (config.health.sentry) {
    initializeSentry(config);
  }
  const healthz = new Healthz(config);
  healthz.isHealthy = false; // start off unhealthy
  if (config.health.healthz.enabled) {
    healthz.listen();
  }

  let bot: Draupnir | null = null;
  let apis: WebAPIs | null = null;
  try {
    const storagePath = path.isAbsolute(config.dataPath)
      ? config.dataPath
      : path.join(__dirname, "../", config.dataPath);
    const storage = new SimpleFsStorageProvider(
      path.join(storagePath, "bot.json")
    );

    let client: MatrixClient;
    if (config.pantalaimon.use && !config.experimentalRustCrypto) {
      const pantalaimon = new PantalaimonClient(config.homeserverUrl, storage);
      client = await pantalaimon.createClientWithCredentials(
        config.pantalaimon.username,
        config.pantalaimon.password
      );
    } else if (config.experimentalRustCrypto) {
      if (config.pantalaimon.use) {
        throw Error(
          "You have a pantalaimon config activated and experimentalRustCrypto. Make sure the accessToken is set and pantalaimon is disabled!"
        );
      }
      const cryptoStorage = new RustSdkCryptoStorageProvider(
        path.join(storagePath, "crypto"),
        StoreType.Sqlite
      );

      client = new MatrixClient(
        config.homeserverUrl,
        config.accessToken,
        storage,
        cryptoStorage
      );
    } else {
      client = new MatrixClient(
        config.homeserverUrl,
        config.accessToken,
        storage
      );
    }
    patchMatrixClient();
    config.RUNTIME.client = client;
    const eventDecoder = DefaultEventDecoder;
    const store = config.roomStateBackingStore.enabled
      ? new SqliteRoomStateBackingStore(
          path.join(config.dataPath, "room-state-backing-store.db"),
          eventDecoder
        )
      : undefined;
    bot = await makeDraupnirBotModeFromConfig(
      client,
      new SafeMatrixEmitterWrapper(client, eventDecoder),
      config,
      store
    );
    apis = constructWebAPIs(bot);
  } catch (err) {
    console.error(
      `Failed to setup mjolnir from the config ${config.dataPath}: ${err}`
    );
    throw err;
  }
  try {
    await bot.start();
    await config.RUNTIME.client.start();
    await apis.start();
    healthz.isHealthy = true;
  } catch (err) {
    console.error(`Mjolnir failed to start: ${err}`);
    bot.stop();
    apis.stop();
    throw err;
  }
})();
