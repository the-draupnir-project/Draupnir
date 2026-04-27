// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { readTestConfig, setupHarnessWithConfig } from "../utils/harness";
import { newTestUser } from "../../integration/clientHelper";
import { MjolnirAppService } from "../../../src/appservice/AppService";

describe("Managed room bootstrap startup integration", function (this: Mocha.Suite) {
  it("appservice mode reaches started stage with managed admin room enabled", async function (this: Mocha.Context) {
    this.timeout(120000);
    const config = readTestConfig();
    const initialManager = await newTestUser(config.homeserver.url, {
      name: { contains: "managed-admin" },
    });
    config.managedAdminRoom = true;
    config.adminRoom = undefined;
    config.initialManager = (await initialManager.getUserId()) as StringUserID;

    let appservice: MjolnirAppService | undefined;
    try {
      appservice = await setupHarnessWithConfig(config, {
        ensureAdminRoomAlias: false,
      });
      if (appservice.accessControlRoomID.length === 0) {
        throw new TypeError(
          "Managed appservice bootstrap did not produce an admin room"
        );
      }
    } finally {
      initialManager.stop();
      if (appservice) {
        await appservice.close();
      }
    }
  });
});
