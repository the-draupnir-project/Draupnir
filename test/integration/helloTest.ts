// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixClient } from "matrix-bot-sdk";
import { newTestUser, noticeListener } from "./clientHelper";
import { DraupnirTestContext } from "./mjolnirSetupUtils";
import { SafeMatrixEmitterWrapper } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DefaultEventDecoder } from "matrix-protection-suite";

describe("Test: !help command", function () {
  let client: MatrixClient;
  this.beforeEach(async function (this: DraupnirTestContext) {
    client = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "-" },
    });
    await client.start();
  } as unknown as Mocha.AsyncFunc);
  this.afterEach(async function () {
    client.stop();
  } as unknown as Mocha.AsyncFunc);
  it("Draupnir responded to !mjolnir help", async function (
    this: DraupnirTestContext
  ) {
    this.timeout(30000);
    // send a messgage
    const draupnir = this.draupnir;
    const clientEmitter = new SafeMatrixEmitterWrapper(
      client,
      DefaultEventDecoder
    );
    if (draupnir === undefined) {
      throw new TypeError(`setup code is wrong`);
    }
    await client.joinRoom(this.config.managementRoom);
    // listener for getting the event reply
    const reply = new Promise((resolve) => {
      clientEmitter.on(
        "room.message",
        noticeListener(draupnir.managementRoomID, (event) => {
          if (event.content.body.includes("which can be used")) {
            resolve(event);
          }
        })
      );
    });
    await client.sendMessage(draupnir.managementRoomID, {
      msgtype: "m.text",
      body: "!draupnir help",
    });
    await reply;
  } as unknown as Mocha.AsyncFunc);
});
