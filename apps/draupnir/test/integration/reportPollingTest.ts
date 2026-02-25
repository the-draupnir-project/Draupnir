// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixClient } from "matrix-bot-sdk";
import { newTestUser } from "./clientHelper";
import { DraupnirTestContext } from "./mjolnirSetupUtils";
import {
  MatrixRoomReference,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { randomUUID } from "crypto";
import expect from "expect";
import { createMock } from "ts-auto-mock";
import { ReportManager } from "../../src/report/ReportManager";
import { ReportPoller } from "../../src/report/ReportPoller";

describe("Test: Report polling", function () {
  let client: MatrixClient;
  let reportPoller: ReportPoller | undefined;
  this.beforeEach(async function () {
    client = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "protection-settings" },
    });
  });
  this.afterEach(function () {
    reportPoller?.stop();
  });
  it("Draupnir correctly retrieves a report from synapse", async function (
    this: DraupnirTestContext
  ) {
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`Test didn't setup properly`);
    }
    const protectedRoomId = await draupnir.client.createRoom({
      invite: [await client.getUserId()],
    });
    await client.joinRoom(protectedRoomId);
    await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
      MatrixRoomReference.fromRoomID(protectedRoomId as StringRoomID)
    );
    const testReportReason = randomUUID();
    const reportsFound = new Set<string>();
    const duplicateReports = new Set<string>();
    const reportManager = createMock<ReportManager>({
      handleServerAbuseReport({ event, reason }) {
        if (reason === testReportReason) {
          if (reportsFound.has(event.event_id)) {
            duplicateReports.add(event.event_id);
          }
          reportsFound.add(event.event_id);
        }
        return Promise.resolve(undefined);
      },
    });
    reportPoller = new ReportPoller(draupnir, reportManager, {
      pollPeriod: 500,
    });
    const reportEvent = async () => {
      const eventId = await client.sendMessage(protectedRoomId, {
        msgtype: "m.text",
        body: "uwNd3q",
      });
      await client.doRequest(
        "POST",
        `/_matrix/client/r0/rooms/${encodeURIComponent(protectedRoomId)}/report/${encodeURIComponent(eventId)}`,
        "",
        {
          reason: testReportReason,
        }
      );
    };
    reportPoller.start({ from: 1 });
    for (let i = 0; i < 20; i++) {
      await reportEvent();
    }
    // wait for them to come down the poll.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(reportsFound.size).toBe(20);
    expect(duplicateReports.size).toBe(0);
  } as unknown as Mocha.AsyncFunc);
});
