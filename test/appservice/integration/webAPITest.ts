// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MjolnirAppService } from "../../../src/appservice/AppService";
import { newTestUser } from "../../integration/clientHelper";
import { isPolicyRoom, readTestConfig, setupHarness } from "../utils/harness";
import {
  ProvisionDraupnirResponse,
  DraupnirWebAPIClient,
  GetBotsForUserResponse,
} from "../utils/webAPIClient";
import { MatrixClient } from "matrix-bot-sdk";
import { getFirstReply } from "../../integration/commands/commandUtils";
import expect from "expect";

interface Context extends Mocha.Context {
  appservice?: MjolnirAppService;
  moderator?: MatrixClient;
}

describe("Test that the app service can provision a draupnir when requested from the web API", function () {
  afterEach(function (this: Context) {
    this.moderator?.stop();
    if (this.appservice) {
      return this.appservice.close();
    } else {
      console.warn("Missing Appservice in this context, so cannot stop it.");
      return Promise.resolve(); // TS7030: Not all code paths return a value.
    }
  });

  it("A moderator that requests a draupnir via a matrix invitation will be invited to a new policy and management room", async function (this: Context) {
    const config = readTestConfig();
    this.appservice = await setupHarness();
    // create a moderator
    const moderator = await newTestUser(config.homeserver.url, {
      name: { contains: "test" },
    });
    const apiClient = await DraupnirWebAPIClient.makeClient(
      moderator,
      "http://localhost:9001"
    );
    const roomToProtectId = await moderator.createRoom({
      preset: "public_chat",
    });

    // have the moderator invite the appservice bot in order to request a new draupnir
    this.moderator = moderator;
    const roomsInvitedTo: string[] = [];
    const draupnirDetails: ProvisionDraupnirResponse = await new Promise(
      (resolve) => {
        void (async () => {
          const draupnirDetailsPromise = apiClient.provisionDraupnir([
            roomToProtectId,
          ]);
          moderator.on("room.invite", (roomId: string) => {
            roomsInvitedTo.push(roomId);
            // the appservice should invite it to a policy room and a management room.
            if (roomsInvitedTo.length === 2) {
              void draupnirDetailsPromise.then(resolve);
            }
          });
          await moderator.start();
        })();
      }
    );
    await Promise.all(
      roomsInvitedTo.map((roomId) => moderator.joinRoom(roomId))
    );
    const managementRoomId = roomsInvitedTo.filter(
      async (roomId) => !(await isPolicyRoom(moderator, roomId))
    )[0];
    if (managementRoomId !== draupnirDetails.managementRoom) {
      throw new TypeError(`Unable to find the management room`);
    }
    // Check that the newly provisioned draupnir is actually responsive.
    const event = await getFirstReply(moderator, managementRoomId, () => {
      return moderator.sendMessage(managementRoomId, {
        body: `!draupnir status`,
        msgtype: "m.text",
      });
    });
    expect(event.sender).toBe(draupnirDetails.botID);
  });

  it("Can list bots for the owner", async function (this: Context) {
    const config = readTestConfig();
    this.appservice = await setupHarness();
    // create a moderator
    const moderator = await newTestUser(config.homeserver.url, {
      name: { contains: "test2" },
    });
    const apiClient = await DraupnirWebAPIClient.makeClient(
      moderator,
      "http://localhost:9001"
    );

    const draupnirDetails: ProvisionDraupnirResponse =
      await apiClient.provisionDraupnir();
    const draupnirs: GetBotsForUserResponse = await apiClient.getBotsForUser();
    expect(draupnirs.bots).toContain(draupnirDetails.botID);
    expect(draupnirs.bots).toHaveLength(1);
    expect(draupnirs.bots[0]).toBe(draupnirDetails.botID);
  });
});
