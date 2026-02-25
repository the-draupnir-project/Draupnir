// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { newTestUser } from "../clientHelper";
import { DraupnirTestContext, draupnir } from "../mjolnirSetupUtils";
import { testRecoverAndRestart } from "./recoverCommandDetail";

describe("We should be able to restart and recover draupnir when it has bad account data", function () {
  it("Recovering protected rooms", async function (this: DraupnirTestContext) {
    const moderator = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "moderator" },
    });
    await draupnir().client.inviteUser(
      await moderator.getUserId(),
      draupnir().managementRoomID
    );
    await moderator.joinRoom(draupnir().managementRoomID);
    await testRecoverAndRestart(
      (await moderator.getUserId()) as StringUserID,
      draupnir()
    );
  } as unknown as Mocha.AsyncFunc);
});
