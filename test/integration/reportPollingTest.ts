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
  ActionResult,
  Ok,
  Protection,
  ProtectionDescription,
  describeConfig,
} from "matrix-protection-suite";
import {
  MatrixRoomReference,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "crypto";
import expect from "expect";
import { WebAPIs } from "../../src/webapis/WebAPIs";

describe("Test: Report polling", function () {
  let client: MatrixClient;
  let forwardingOnlyWebAPIS: WebAPIs | undefined;
  this.beforeEach(async function () {
    client = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "protection-settings" },
    });
  });
  this.afterEach(function () {
    void forwardingOnlyWebAPIS?.stop();
  })
  it("Draupnir correctly retrieves a report from synapse", async function (
    this: DraupnirTestContext
  ) {
    this.timeout(40000);
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`Test didn't setup properly`);
    }
    // It's essential to stop the webapis so that we can make sure reports
    // are only forwarded from polling.
    // And also there is a major bug where the report handler can run during
    // the cleanup for this test and cause hanging / crashes.
    await this.toggle?.stopWebAPIS();
    forwardingOnlyWebAPIS = new WebAPIs(draupnir.reportManager, this.config, {
      isHandlingReports: false,
    });
    await forwardingOnlyWebAPIS.start();
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
    const testProtectionDescription: ProtectionDescription = {
      name: "jYvufI",
      description: "A test protection",
      capabilities: {},
      defaultCapabilities: {},
      factory: function (
        _description,
        _protectedRoomsSet,
        _context,
        _capabilities,
        _settings
      ): ActionResult<Protection<ProtectionDescription>> {
        return Ok({
          handleEventReport(report) {
            if (report.reason === testReportReason) {
              if (reportsFound.has(report.event_id)) {
                duplicateReports.add(report.event_id);
              }
              reportsFound.add(report.event_id);
            }
            return Promise.resolve(Ok(undefined));
          },
          description: testProtectionDescription,
          requiredEventPermissions: [],
          requiredPermissions: [],
          requiredStatePermissions: [],
        });
      },
      protectionSettings: describeConfig({ schema: Type.Object({}) }),
    };
    await draupnir.protectedRoomsSet.protections.addProtection(
      testProtectionDescription,
      draupnir.protectedRoomsSet,
      draupnir
    );
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
    }
    for (let i = 0; i < 20; i++) {
      await reportEvent();
    }
    // wait for them to come down sync.
    await new Promise((resolve) => setTimeout(resolve, 5000));
    expect(reportsFound.size).toBe(20);
    expect(duplicateReports.size).toBe(0);
  } as unknown as Mocha.AsyncFunc);
});
