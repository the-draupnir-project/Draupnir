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
  MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
  MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
} from "matrix-protection-suite";
import { constructWebAPIs } from "../../src/DraupnirBotMode";
import { read as configRead } from "../../src/config";
import { patchMatrixClient } from "../../src/utils";
import {
  DraupnirTestContext,
  draupnirClient,
  makeMjolnir,
  teardownManagementRoom,
} from "./mjolnirSetupUtils";
import { MatrixRoomReference } from "@the-draupnir-project/matrix-basic-types";

patchMatrixClient();

// When Mjolnir starts (src/index.ts) it clobbers the config by resolving the management room
// alias specified in the config (config.managementRoom) and overwriting that with the room ID.
// Unfortunately every piece of code importing that config imports the same instance, including
// testing code, which is problematic when we want to create a fresh management room for each test.
// So there is some code in here to "undo" the mutation after we stop Mjolnir syncing.
export const mochaHooks = {
  beforeEach: [
    async function (this: DraupnirTestContext) {
      console.error(
        "---- entering test",
        JSON.stringify(this.currentTest?.title)
      ); // Makes MatrixClient error logs a bit easier to parse.
      console.log("mochaHooks.beforeEach");
      const test = MatrixRoomReference.fromPermalink(
        "https://matrix.to/#/!JzRjamSLPHAikHkPab%3Alocalhost%3A9999?via=localhost:9999"
      );
      console.log(test);
      // Sometimes it takes a little longer to register users.
      this.timeout(30000);
      const config = (this.config = configRead());
      this.managementRoomAlias = config.managementRoom;
      this.draupnir = await makeMjolnir(config);
      const draupnirMatrixClient = draupnirClient();
      if (draupnirMatrixClient === null) {
        throw new TypeError(`setup code is broken`);
      }
      config.RUNTIME.client = draupnirMatrixClient;
      await Promise.all([
        this.draupnir.client.setAccountData(
          MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
          { rooms: [] }
        ),
        this.draupnir.client.setAccountData(
          MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
          { references: [] }
        ),
      ]);
      await this.draupnir.start();
      this.apis = constructWebAPIs(this.draupnir);
      await this.apis.start();
      await draupnirClient()?.start();
      console.log("mochaHooks.beforeEach DONE");
    },
  ],
  afterEach: [
    async function (this: DraupnirTestContext) {
      this.timeout(10000);
      this.apis?.stop();
      draupnirClient()?.stop();
      this.draupnir?.stop();

      // remove alias from management room and leave it.
      if (this.draupnir !== undefined) {
        await Promise.all([
          this.draupnir.client.setAccountData(
            MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
            { rooms: [] }
          ),
          this.draupnir.client.setAccountData(
            MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
            { references: [] }
          ),
        ]);
        const client = draupnirClient();
        if (client !== null && this.managementRoomAlias !== undefined) {
          await teardownManagementRoom(
            client,
            this.draupnir.managementRoomID,
            this.managementRoomAlias
          );
        }
      }
      console.error(
        "---- completed test",
        JSON.stringify(this.currentTest?.title),
        "\n\n"
      ); // Makes MatrixClient error logs a bit easier to parse.
    },
  ],
};
