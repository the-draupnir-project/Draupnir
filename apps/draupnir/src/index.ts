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
  SimpleFsStorageProvider,
  RustSdkCryptoStorageProvider,
} from "matrix-bot-sdk";
import { StoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";
import { configRead as configRead, getStoragePath } from "./config";
import { initializeSentry } from "./utils";
import { DraupnirBotModeToggle } from "./DraupnirBotMode";
import { SafeMatrixEmitterWrapper } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DefaultEventDecoder } from "matrix-protection-suite";
import { makeTopLevelStores } from "./backingstore/DraupnirStores";

void (async function () {
  const config = configRead();

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

  let bot: DraupnirBotModeToggle | null = null;
  let client: MatrixClient;
  try {
    const storagePath = getStoragePath(config.dataPath);
    const storage = new SimpleFsStorageProvider(
      path.join(storagePath, "bot.json")
    );

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
    const eventDecoder = DefaultEventDecoder;
    const stores = makeTopLevelStores(storagePath, eventDecoder, {
      isRoomStateBackingStoreEnabled:
        config.roomStateBackingStore.enabled ?? false,
    });
    bot = await DraupnirBotModeToggle.create(
      client,
      new SafeMatrixEmitterWrapper(client, eventDecoder),
      config,
      stores
    );

    // We don't want to send the status on start, as we need to initialize e2ee first (using client.start);
    (await bot.startFromScratch({ sendStatusOnStart: false })).expect(
      "Failed to start Draupnir"
    );
  } catch (err) {
    console.error(
      `Failed to setup draupnir from the config ${config.dataPath}: ${err}`
    );
    await bot?.stopEverything();
    throw err;
  }
  try {
    await client.start();
    await bot.encryptionInitialized();
    healthz.isHealthy = true;
  } catch (err) {
    console.error(`Draupnir failed to start: ${err}`);
    await bot.stopEverything();
    throw err;
  }
})();
