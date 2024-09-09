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
  PolicyListConfig,
  PropagationType,
  RoomResolver,
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
  const issuerManager = createMock<PolicyListConfig>({
    async watchList(propagation, room, _options) {
      expect(room).toBe(policyRoom);
      expect(propagation).toBe(PropagationType.Direct);
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
      { issuerManager, roomResolver },
      {},
      policyRoom
    );
    expect(isOk(result)).toBe(true);
  });
  it("DraupnirUnwatchCommand", async function () {
    const result = await CommandExecutorHelper.execute(
      DraupnirUnwatchPolicyRoomCommand,
      { issuerManager, roomResolver },
      {},
      policyRoom
    );
    expect(isOk(result)).toBe(true);
  });
});
