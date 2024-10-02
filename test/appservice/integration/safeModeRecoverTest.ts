// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { newTestUser } from "../../integration/clientHelper";
import { StandardProvisionHelper } from "../utils/ProvisionHelper";
import { setupHarness } from "../utils/harness";
import { testRecoverAndRestart } from "../../integration/commands/recoverCommandDetail";

interface Context extends Mocha.Context {
  appservice?: MjolnirAppService;
}

describe("Test safe mode recovery on a provisioned Draupnir", function () {
  beforeEach(async function (this: Context) {
    this.appservice = await setupHarness();
  });
  afterEach(function (this: Context) {
    if (this.appservice) {
      return this.appservice.close();
    } else {
      console.warn("Missing Appservice in this context, so cannot stop it.");
      return Promise.resolve(); // TS7030: Not all code paths return a value.
    }
  });
  it("Provisioned draupnir can be recovered from safe mode.", async function (this: Context) {
    const appservice = this.appservice;
    if (appservice === undefined) {
      throw new TypeError(`Test setup failed`);
    }
    const provisionHelper = new StandardProvisionHelper(appservice);
    const moderator = await newTestUser(appservice.config.homeserver.url, {
      name: { contains: "moderator" },
    });
    const moderatorUserID = (await moderator.getUserId()) as StringUserID;
    const initialDraupnir = (
      await provisionHelper.provisionDraupnir(moderatorUserID)
    ).expect("Failed to provision a draupnir for the test");
    await testRecoverAndRestart(moderatorUserID, initialDraupnir);
  });
});
