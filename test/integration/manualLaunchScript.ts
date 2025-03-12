// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

/**
 * This file is used to launch mjolnir for manual testing, creating a user and management room automatically if it doesn't already exist.
 */

import { draupnirClient, makeBotModeToggle } from "./mjolnirSetupUtils";
import { configRead, getStoragePath } from "../../src/config";
import { DefaultEventDecoder } from "matrix-protection-suite";
import { makeTopLevelStores } from "../../src/backingstore/DraupnirStores";

void (async () => {
  const config = configRead();
  const storagePath = getStoragePath(config.dataPath);
  const toggle = await makeBotModeToggle(config, {
    stores: makeTopLevelStores(storagePath, DefaultEventDecoder, {
      isRoomStateBackingStoreEnabled:
        config.roomStateBackingStore.enabled ?? false,
    }),
    allowSafeMode: true,
  });
  await draupnirClient()?.start();
  await toggle.encryptionInitialized();
})();
