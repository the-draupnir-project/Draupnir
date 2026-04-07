// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0

import { configRead, getStoragePath, IConfig } from "../../src/config";
import { DraupnirBotModeToggle } from "../../src/DraupnirBotMode";
import { makeTopLevelStores } from "../../src/backingstore/DraupnirStores";
import { draupnirClient, makeBotModeToggle } from "./mjolnirSetupUtils";
import { DefaultEventDecoder } from "matrix-protection-suite";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

function makeManagedBotModeConfig(): IConfig {
  const config = configRead();
  const username = `managed_bootstrap_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const initialManager = `managed_bootstrap_manager_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const homeserverDomain = new URL(config.homeserverUrl).host;
  config.pantalaimon.username = username;
  config.pantalaimon.password = username;
  config.managementRoom = undefined;
  config.managedManagementRoom = true;
  config.initialManager =
    `@${initialManager}:${homeserverDomain}` as StringUserID;
  return config;
}

describe("Managed room bootstrap startup integration", function (this: Mocha.Suite) {
  it("bot mode reaches started stage with managed management room enabled", async function (this: Mocha.Context) {
    this.timeout(120000);
    const config = makeManagedBotModeConfig();
    const storagePath = getStoragePath(config.dataPath);
    const stores = makeTopLevelStores(storagePath, DefaultEventDecoder, {
      isRoomStateBackingStoreEnabled:
        config.roomStateBackingStore.enabled ?? false,
    });

    let toggle: DraupnirBotModeToggle | undefined;
    try {
      toggle = await makeBotModeToggle(config, {
        stores,
        allowSafeMode: false,
        deleteManagementRoomAliasOnStart: false,
        ensureManagementRoomAlias: false,
      });
      await draupnirClient()?.start();
      await toggle.encryptionInitialized();
    } finally {
      await toggle?.[Symbol.asyncDispose]();
      draupnirClient()?.stop();
      stores.dispose();
    }
  });
});
