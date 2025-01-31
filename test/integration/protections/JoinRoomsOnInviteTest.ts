// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { newTestUser } from "../clientHelper";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import expect from "expect";

describe("JoinRoomsOnInvite", function () {
  it(
    "Should automatically protect and unrpotect rooms when joining and leaving.\
    The principle is that we add a bunch of rooms, and then kick the bot.\
    You can go to the management room in a client and see what the output looks like for this flow.",
    async function (this: DraupnirTestContext) {
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`setup didn't run properly`);
      }
      const moderator = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "moderator" },
      });
      // Mutate the config which is a little naughty, but protections
      // currently access it dynamically.
      draupnir.config.protectAllJoinedRooms = true;
      await moderator.joinRoom(draupnir.managementRoomID);
      const protectedRooms = await Promise.all(
        [...Array(5)].map(async (_) => {
          const room = await moderator.createRoom({
            invite: [draupnir.clientUserID],
          });
          await moderator.setUserPowerLevel(draupnir.clientUserID, room, 90);
          return room;
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect(
        protectedRooms.every((roomID: StringRoomID) =>
          draupnir.protectedRoomsSet.isProtectedRoom(roomID)
        )
      ).toBe(true);
      // now test that kicking them works
      await Promise.all(
        protectedRooms.map((roomID) =>
          moderator.kickUser(draupnir.clientUserID, roomID)
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(
        protectedRooms.every(
          (roomID: StringRoomID) =>
            !draupnir.protectedRoomsSet.isProtectedRoom(roomID)
        )
      ).toBe(true);
      // allow for messages to send to the mangement room.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } as unknown as Mocha.AsyncFunc
  );
});
