// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomID,
  MatrixRoomReference,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import expect from "expect";
import {
  Ok,
  PropagationType,
  RoomResolver,
  WatchedPolicyRooms,
  isError,
  isOk,
} from "matrix-protection-suite";
import { createMock } from "ts-auto-mock";
import {
  DraupnirUnwatchPolicyRoomCommand,
  DraupnirWatchPolicyRoomCommand,
} from "../../../src/commands/WatchUnwatchCommand";
import { CommandExecutorHelper } from "@the-draupnir-project/interface-manager";

describe("Test the WatchUnwatchCommmands", function () {
  const policyRoom = MatrixRoomReference.fromRoomID(
    "!room:example.com" as StringRoomID
  );
  const watchedPolicyRooms = createMock<WatchedPolicyRooms>({
    async watchPolicyRoomDirectly(room) {
      expect(room).toBe(policyRoom);
      return Ok(undefined);
    },
  });
  const roomResolver = createMock<RoomResolver>({
    async resolveRoom(roomReference) {
      if (roomReference instanceof MatrixRoomID) {
        return Ok(roomReference);
      }
      throw new TypeError(`We don't really expect to resolve anything`);
    },
  });
  it("DraupnirWatchCommand", async function () {
    const result = await CommandExecutorHelper.execute(
      DraupnirWatchPolicyRoomCommand,
      { watchedPolicyRooms, roomResolver },
      {},
      policyRoom
    );
    expect(isOk(result)).toBe(true);
  });
  it("Draupnir watch command should return an error if the room is already being watched", async function () {
    const issuerManagerWithWatchedList = createMock<WatchedPolicyRooms>({
      allRooms: [{ room: policyRoom, propagation: PropagationType.Direct }],
    });
    const result = await CommandExecutorHelper.execute(
      DraupnirWatchPolicyRoomCommand,
      { watchedPolicyRooms: issuerManagerWithWatchedList, roomResolver },
      {},
      policyRoom
    );
    expect(isError(result)).toBe(true);
  });
  it("DraupnirUnwatchCommand", async function () {
    const result = await CommandExecutorHelper.execute(
      DraupnirUnwatchPolicyRoomCommand,
      { watchedPolicyRooms, roomResolver },
      {},
      policyRoom
    );
    expect(isOk(result)).toBe(true);
  });
});
