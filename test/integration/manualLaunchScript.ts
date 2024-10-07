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
import { configRead } from "../../src/config";
import { SqliteRoomStateBackingStore } from "../../src/backingstore/better-sqlite3/SqliteRoomStateBackingStore";
import path from "path";
import { DefaultEventDecoder } from "matrix-protection-suite";

void (async () => {
  const config = configRead();
  const toggle = await makeBotModeToggle(config, {
    backingStore: new SqliteRoomStateBackingStore(
      path.join(config.dataPath, "room-state-backing-store.db"),
      DefaultEventDecoder
    ),
    allowSafeMode: true,
  });
  await draupnirClient()?.start();
  await toggle.encryptionInitialized();
})();
