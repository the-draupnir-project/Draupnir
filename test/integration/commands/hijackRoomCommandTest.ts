// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021, 2022 Marco Cirillo
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { strict as assert } from "assert";
import { newTestUser } from "../clientHelper";
import { getFirstReaction } from "./commandUtils";
import { DraupnirTestContext, draupnirSafeEmitter } from "../mjolnirSetupUtils";

describe("Test: The make admin command", function () {
  it("Draupnir make the bot self room administrator", async function (
    this: DraupnirTestContext
  ) {
    this.timeout(90000);
    if (!this.config.admin?.enableMakeRoomAdminCommand) {
      this.done();
    }
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`Test didn't setup correctly`);
    }
    const moderator = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "moderator" },
    });
    const userA = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "a" },
    });
    const userAId = await userA.getUserId();

    await moderator.joinRoom(draupnir.managementRoomID);
    const targetRoom = await moderator.createRoom({
      invite: [draupnir.clientUserID],
      preset: "public_chat",
    });
    await moderator.sendMessage(draupnir.managementRoomID, {
      msgtype: "m.text.",
      body: `!draupnir rooms add ${targetRoom}`,
    });
    await userA.joinRoom(targetRoom);
    const powerLevelsBefore = await moderator.getRoomStateEvent(
      targetRoom,
      "m.room.power_levels",
      ""
    );
    assert.notEqual(
      powerLevelsBefore["users"][draupnir.clientUserID],
      100,
      `Bot should not yet be an admin of ${targetRoom}`
    );
    await getFirstReaction(
      draupnirSafeEmitter(),
      draupnir.managementRoomID,
      "✅",
      async () => {
        return await moderator.sendMessage(draupnir.managementRoomID, {
          msgtype: "m.text",
          body: `!draupnir hijack room ${targetRoom} ${draupnir.clientUserID}`,
        });
      }
    );

    const powerLevelsAfter = await moderator.getRoomStateEvent(
      targetRoom,
      "m.room.power_levels",
      ""
    );
    assert.equal(
      powerLevelsAfter["users"][draupnir.clientUserID],
      100,
      "Bot should be a room admin."
    );
    assert.equal(
      powerLevelsAfter["users"][userAId],
      undefined,
      "User A is not supposed to be a room admin."
    );
  } as unknown as Mocha.AsyncFunc);
});
