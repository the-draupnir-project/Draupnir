// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomReference,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { newTestUser } from "../clientHelper";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import expect from "expect";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { Draupnir } from "../../../src/Draupnir";

async function setupProtectedRooms(
  draupnir: Draupnir,
  moderator: MatrixSendClient,
  { numberOfRooms }: { numberOfRooms: number }
): Promise<StringRoomID[]> {
  await moderator.joinRoom(draupnir.managementRoomID);
  return await Promise.all(
    [...Array(numberOfRooms)].map(async (_) => {
      const room = await moderator.createRoom({
        invite: [draupnir.clientUserID],
      });
      await moderator.setUserPowerLevel(draupnir.clientUserID, room, 90);
      return room as StringRoomID;
    })
  );
}

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
      const protectedRooms = await setupProtectedRooms(draupnir, moderator, {
        numberOfRooms: 5,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect(
        protectedRooms.every((roomID: StringRoomID) =>
          draupnir.protectedRoomsSet.isProtectedRoom(roomID)
        )
      ).toBe(true);
      // now test that kicking them works
      await Promise.all(
        protectedRooms.map((roomID, i) =>
          moderator.kickUser(
            draupnir.clientUserID,
            roomID,
            i === 0 ? "don't want this bot" : undefined
          )
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
  it(
    "That rooms will automatically be unprotected when protectAllJoinedRooms is false",
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
      draupnir.config.protectAllJoinedRooms = false;
      const protectedRooms = await setupProtectedRooms(draupnir, moderator, {
        numberOfRooms: 5,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // we shouldn't be protecting rooms automatically
      expect(
        protectedRooms.every(
          (roomID: StringRoomID) =>
            !draupnir.protectedRoomsSet.isProtectedRoom(roomID)
        )
      ).toBe(true);
      // protect the rooms manually
      await Promise.all(
        protectedRooms.map((roomID) =>
          draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
            MatrixRoomReference.fromRoomID(roomID)
          )
        )
      );
      expect(
        protectedRooms.every((roomID: StringRoomID) =>
          draupnir.protectedRoomsSet.isProtectedRoom(roomID)
        )
      ).toBe(true);
      // now test that banning them works
      await Promise.all(
        protectedRooms.map((roomID, i) =>
          // I would have liked this to be ban, but for some reason bot-sdk
          // doesn't allow informing of rooms you are banned from!!!
          moderator.kickUser(
            draupnir.clientUserID,
            roomID,
            i === 0 ? "don't want this bot" : undefined
          )
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
