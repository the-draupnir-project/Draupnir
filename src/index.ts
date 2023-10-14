/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

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

import * as path from "path";

import { Healthz } from "./health/healthz";

import {
    LogLevel,
    LogService,
    MatrixClient,
    PantalaimonClient,
    RichConsoleLogger,
    SimpleFsStorageProvider,
    RustSdkCryptoStorageProvider
} from "matrix-bot-sdk";

import { read as configRead } from "./config";
import { Mjolnir } from "./Mjolnir";
import { initializeSentry, patchMatrixClient } from "./utils";


(async function () {
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

    let bot: Mjolnir | null = null;
    try {
        const storagePath = path.isAbsolute(config.dataPath) ? config.dataPath : path.join(__dirname, '../', config.dataPath);
        const storage = new SimpleFsStorageProvider(path.join(storagePath, "bot.json"));

        let client: MatrixClient;
        if (config.pantalaimon.use && !config.experimentalRustCrypto) {
            const pantalaimon = new PantalaimonClient(config.homeserverUrl, storage);
            client = await pantalaimon.createClientWithCredentials(config.pantalaimon.username, config.pantalaimon.password);
        } else if (config.experimentalRustCrypto) {
            if (config.pantalaimon.use) {
                console.warn("You have a pantalaimon config activated and experimentalRustCrypto. Make sure the accessToken is set and pantalaimon is disabled!");
            }
            // 0 means sqlite. It comes from "@matrix-org/matrix-sdk-crypto-nodejs" and is ensured to be 0 by https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs/blob/8cfee331a7fbfb00625bd3b86a78686a0f954534/tests/machine.test.js#L27-L31
            const cryptoStorage = new RustSdkCryptoStorageProvider(path.join(storagePath, "crypto"), 0);

            client = new MatrixClient(config.homeserverUrl, config.accessToken, storage, cryptoStorage);
        } else {
            client = new MatrixClient(config.homeserverUrl, config.accessToken, storage);
        }
        patchMatrixClient();
        config.RUNTIME.client = client;

        bot = await Mjolnir.setupMjolnirFromConfig(client, client, config);
    } catch (err) {
        console.error(`Failed to setup mjolnir from the config ${config.dataPath}: ${err}`);
        throw err;
    }
    try {
        await bot.start();
        healthz.isHealthy = true;
    } catch (err) {
        console.error(`Mjolnir failed to start: ${err}`);
        throw err;
    }
})();
