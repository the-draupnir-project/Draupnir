// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { CommandExecutorHelper } from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomID,
  MatrixUserID,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  Logger,
  Membership,
  Ok,
  RoomKicker,
  RoomResolver,
  describeProtectedRoomsSet,
  isError,
} from "matrix-protection-suite";
import { DraupnirKickCommand } from "../../../src/commands/KickCommand";
import { ThrottlingQueue } from "../../../src/queues/ThrottlingQueue";
import ManagementRoomOutput from "../../../src/managementroom/ManagementRoomOutput";
import { createMock } from "ts-auto-mock";
import expect from "expect";

const log = new Logger("KickCommandTest");

async function createProtectedRooms() {
  return await describeProtectedRoomsSet({
    rooms: [
      {
        membershipDescriptions: [...Array(50)].map((_, index) => ({
          membership: Membership.Join,
          sender: `@${index}:testserver.example.com` as StringUserID,
        })),
      },
      {
        membershipDescriptions: [
          {
            membership: Membership.Join,
            sender: `@alice:testserver.example.com` as StringUserID,
          },
          {
            membership: Membership.Join,
            sender: `@bob:bob.example.com` as StringUserID,
          },
        ],
      },
    ],
  });
}

const managmenetRoomOutput = createMock<ManagementRoomOutput>({
  logMessage(_level, module, message, _additionalRoomIds, _isRecursive) {
    log.error(module, message);
    throw new TypeError(`We don't expect to be logging anything`);
  },
});
const taskQueue = new ThrottlingQueue(managmenetRoomOutput, 0);

describe("Test the KickCommand", function () {
  const roomResolver = createMock<RoomResolver>({
    async resolveRoom(roomReference) {
      if (roomReference instanceof MatrixRoomID) {
        return Ok(roomReference);
      }
      throw new TypeError(`We don't really expect to resolve anything`);
    },
  });
  it("Will kick users from protected rooms when a glob is used", async function () {
    const { protectedRoomsSet } = await createProtectedRooms();
    const roomKicker = createMock<RoomKicker>({
      async kickUser(_room, userID, _reason) {
        // We should only kick users that match the glob...
        expect(userServerName(userID)).toBe("testserver.example.com");
        return Ok(undefined);
      },
    });
    const kickResult = await CommandExecutorHelper.execute(
      DraupnirKickCommand,
      {
        taskQueue,
        setMembership: protectedRoomsSet.setRoomMembership,
        roomKicker,
        roomResolver,
        noop: false,
      },
      {
        keywords: { glob: true },
      },
      MatrixUserID.fromUserID(`@*:testserver.example.com` as StringUserID)
    );
    if (isError(kickResult)) {
      throw new TypeError(`We don't expect the kick command itself to fail`);
    }
    const usersToKick = kickResult.ok;
    expect(usersToKick.size).toBe(51);
  });
  it("Will refuse to kick anyone with a glob if the glob flag is not set", async function () {
    const { protectedRoomsSet } = await createProtectedRooms();
    const kickResult = await CommandExecutorHelper.execute(
      DraupnirKickCommand,
      {
        taskQueue,
        setMembership: protectedRoomsSet.setRoomMembership,
        roomKicker: createMock<RoomKicker>(),
        roomResolver,
        noop: false,
      },
      {},
      MatrixUserID.fromUserID(`@*:testserver.example.com` as StringUserID)
    );
    expect(isError(kickResult)).toBe(true);
  });
  it("Will limit the scope to one room if the --room option is provided", async function () {
    const { protectedRoomsSet } = await createProtectedRooms();
    const targetRoom = protectedRoomsSet.allProtectedRooms[1];
    if (targetRoom === undefined) {
      throw new TypeError(`Something is wrong with the test!!`);
    }
    const roomKicker = createMock<RoomKicker>({
      async kickUser(room, userID, _reason) {
        // We should only kick users that match the glob...
        expect(userServerName(userID)).toBe("testserver.example.com");
        // We should only kick users in the target room.
        expect(room.toString()).toBe(targetRoom.toRoomIDOrAlias());
        return Ok(undefined);
      },
    });
    const kickResult = await CommandExecutorHelper.execute(
      DraupnirKickCommand,
      {
        taskQueue,
        setMembership: protectedRoomsSet.setRoomMembership,
        roomKicker,
        roomResolver,
        noop: false,
      },
      {
        keywords: { glob: true, room: targetRoom },
      },
      MatrixUserID.fromUserID(`@*:testserver.example.com` as StringUserID)
    );
    if (isError(kickResult)) {
      throw new TypeError(`We don't expect the kick command itself to fail`);
    }
    const usersToKick = kickResult.ok;
    expect(usersToKick.size).toBe(1);
  });
});
