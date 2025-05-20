// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { strict as assert } from "assert";

import { newTestUser } from "../clientHelper";
import { DraupnirTestContext, draupnirClient } from "../mjolnirSetupUtils";
import { MatrixClient, MatrixError } from "matrix-bot-sdk";
import { Task } from "matrix-protection-suite";

describe("Test: shutdown command", function () {
  let client: MatrixClient;
  this.beforeEach(async function () {
    client = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "shutdown-command" },
    });
    await client.start();
  });
  this.afterEach(async function () {
    client.stop();
  });
  it("Draupnir asks synapse to shut down a channel", async function (
    this: DraupnirTestContext
  ) {
    this.timeout(20000);
    const badRoom = await client.createRoom();
    const draupnir = this.draupnir;
    const draupnirMatrixClient = draupnirClient();
    if (draupnir === undefined || draupnirMatrixClient === null) {
      throw new TypeError(`setup code is wrong`);
    }
    await client.joinRoom(draupnir.managementRoomID);

    const reply1 = new Promise((resolve) => {
      void Task(
        (async () => {
          const msgid = await client.sendMessage(draupnir.managementRoomID, {
            msgtype: "m.text",
            body: `!draupnir shutdown room ${badRoom} closure test`,
          });
          client.on("room.event", (roomId, event) => {
            if (
              roomId === draupnir.managementRoomID &&
              event?.type === "m.reaction" &&
              event.sender === draupnir.clientUserID &&
              event.content?.["m.relates_to"]?.event_id === msgid
            ) {
              resolve(event);
            }
          });
        })()
      );
    });

    await reply1;

    await assert.rejects(client.joinRoom(badRoom), (e: MatrixError) => {
      assert.equal(e.statusCode, 403);
      assert.equal(e.body.error, "This room has been blocked on this server");
      return true;
    });
  } as unknown as Mocha.AsyncFunc);
});
