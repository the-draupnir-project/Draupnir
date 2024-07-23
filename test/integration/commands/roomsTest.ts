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
import { getFirstReaction, getFirstReply } from "./commandUtils";
import { draupnirSafeEmitter, DraupnirTestContext } from "../mjolnirSetupUtils";
import { MatrixClient } from "matrix-bot-sdk";

interface RoomsTestContext extends DraupnirTestContext {
  moderator?: MatrixClient;
}

describe("Test: The rooms commands", function () {
  // If a test has a timeout while awaitng on a promise then we never get given control back.
  afterEach(function () {
    this.moderator?.stop();
  });

  it(
    "Mjolnir can protect a room, show that it is protected and then stop protecting the room.",
    async function (this: RoomsTestContext) {
      // Create a few users and a room.
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`Test isn't setup correctly`);
      }
      const moderator = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "moderator" },
      });
      this.moderator = moderator;
      await moderator.joinRoom(this.config.managementRoom);
      const targetRoom = await moderator.createRoom({
        invite: [draupnir.clientUserID],
      });
      await moderator.setUserPowerLevel(draupnir.clientUserID, targetRoom, 100);

      await getFirstReaction(
        draupnirSafeEmitter(),
        draupnir.managementRoomID,
        "✅",
        async () => {
          return await moderator.sendMessage(draupnir.managementRoomID, {
            msgtype: "m.text",
            body: `!draupnir rooms add ${targetRoom}`,
          });
        }
      );
      let protectedRoomsMessage = await getFirstReply(
        draupnirSafeEmitter(),
        draupnir.managementRoomID,
        async () => {
          return await moderator.sendMessage(draupnir.managementRoomID, {
            msgtype: "m.text",
            body: `!draupnir rooms`,
          });
        }
      );
      assert.equal(
        protectedRoomsMessage["content"]["body"].includes("2"),
        true,
        "There should be two protected rooms (including the management room)"
      );
      await getFirstReaction(
        draupnirSafeEmitter(),
        draupnir.managementRoomID,
        "✅",
        async () => {
          return await moderator.sendMessage(draupnir.managementRoomID, {
            msgtype: "m.text",
            body: `!draupnir rooms remove ${targetRoom}`,
          });
        }
      );
      protectedRoomsMessage = await getFirstReply(
        draupnirSafeEmitter(),
        draupnir.managementRoomID,
        async () => {
          return await moderator.sendMessage(draupnir.managementRoomID, {
            msgtype: "m.text",
            body: `!draupnir rooms`,
          });
        }
      );
      assert.equal(
        protectedRoomsMessage["content"]["body"].includes("1"),
        true,
        "Only the management room should be protected."
      );
    } as unknown as Mocha.AsyncFunc
  );
});
