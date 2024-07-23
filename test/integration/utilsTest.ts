// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { strict as assert } from "assert";
import { LogLevel } from "matrix-bot-sdk";
import { DraupnirTestContext, draupnirClient } from "./mjolnirSetupUtils";
import {
  NoticeMessageContent,
  RoomEvent,
  Value,
} from "matrix-protection-suite";

describe("Test: utils", function () {
  it(
    "replaceRoomIdsWithPills correctly turns a room ID in to a pill",
    async function (this: DraupnirTestContext) {
      const managementRoomAlias = this.config.managementRoom;
      const draupnir = this.draupnir;
      const draupnirMatrixClient = draupnirClient();
      if (draupnir === undefined || draupnirMatrixClient === null) {
        throw new TypeError(`Setup code is broken`);
      }
      const managementRoomOutput = draupnir.managementRoomOutput;
      await draupnir.client.sendStateEvent(
        draupnir.managementRoomID,
        "m.room.canonical_alias",
        "",
        { alias: managementRoomAlias }
      );

      const message: RoomEvent = await new Promise((resolve) => {
        draupnirMatrixClient.on("room.message", (roomId, event) => {
          if (roomId === draupnir.managementRoomID) {
            if (event.content?.body?.startsWith("it's")) {
              resolve(event);
            }
          }
        });
        void managementRoomOutput.logMessage(
          LogLevel.INFO,
          "replaceRoomIdsWithPills test",
          `it's fun here in ${draupnir.managementRoomID}`,
          [draupnir.managementRoomID, "!myfaketestid:example.com"]
        );
      });
      if (!Value.Check(NoticeMessageContent, message.content)) {
        throw new TypeError(
          `This test is written with the expectation logMessage will send a notice`
        );
      }
      assert.equal(
        message.content.formatted_body,
        `it&#39;s fun here in <a href="https://matrix.to/#/${encodeURIComponent(managementRoomAlias)}">${managementRoomAlias}</a>`
      );
    } as unknown as Mocha.AsyncFunc
  );
});
