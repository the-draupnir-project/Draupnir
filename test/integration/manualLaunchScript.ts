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

import { draupnirClient, makeMjolnir } from "./mjolnirSetupUtils";
import { read as configRead } from "../../src/config";
import { constructWebAPIs } from "../../src/DraupnirBotMode";
import { SqliteRoomStateBackingStore } from "../../src/backingstore/better-sqlite3/SqliteRoomStateBackingStore";
import path from "path";
import { DefaultEventDecoder, Task } from "matrix-protection-suite";

void (async () => {
  const config = configRead();
  const mjolnir = await makeMjolnir(
    config,
    new SqliteRoomStateBackingStore(
      path.join(config.dataPath, "room-state-backing-store.db"),
      DefaultEventDecoder
    )
  );
  console.info(`management room ${mjolnir.managementRoom.toPermalink()}`);
  await mjolnir.start();
  const apis = constructWebAPIs(mjolnir);
  await draupnirClient()?.start();
  await apis.start();
  void Task(mjolnir.startupComplete());
})();
