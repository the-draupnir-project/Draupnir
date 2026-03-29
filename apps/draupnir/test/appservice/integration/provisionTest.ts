// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { readTestConfig, setupHarnessWithConfig } from "../utils/harness";
import { newTestUser } from "../../integration/clientHelper";
import { getFirstReply } from "../../integration/commands/commandUtils";
import { MatrixClient } from "@vector-im/matrix-bot-sdk";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { isOk } from "matrix-protection-suite";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

interface Context extends Mocha.Context {
  moderator?: MatrixClient;
  appservice?: MjolnirAppService | undefined;
}

describe("Test that the app service can provision a draupnir on invite of the appservice bot", function () {
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
    config.allowSelfServiceProvisioning = true;
    this.appservice = await setupHarnessWithConfig(config);
    const appservice = this.appservice;
    // create a user to act as the moderator
    const moderator = await newTestUser(config.homeserver.url, {
      name: { contains: "test" },
    });
    const roomWeWantProtecting = await moderator.createRoom();
    // have the moderator invite the appservice bot in order to request a new draupnir
    this.moderator = moderator;
    const roomsInvitedTo: string[] = [];
    await new Promise((resolve) => {
      void (async () => {
        moderator.on("room.invite", (roomId: string) => {
          roomsInvitedTo.push(roomId);
          // the appservice should invite the moderator to a policy room and a management room.
          if (roomsInvitedTo.length === 2) {
            resolve(null);
          }
        });
        await moderator.start();
        await moderator.inviteUser(
          appservice.bridge.getBot().getUserId(),
          roomWeWantProtecting
        );
      })();
    });
    await Promise.all(
      roomsInvitedTo.map((roomId) => moderator.joinRoom(roomId))
    );
    // FIXME:
    // Originally this was finding the management room by filtering out the rooms
    // that were not policy rooms. But this code never actually worked, and
    // it just fetches the first invite. Obviously this needs to be fixed
    const managementRoomId = roomsInvitedTo[0];
    if (managementRoomId === undefined) {
      throw new TypeError(`Unable to find management room`);
    }
    // Check that the newly provisioned draupnir is actually responsive.
    await getFirstReply(moderator, managementRoomId, () => {
      return moderator.sendMessage(managementRoomId, {
        body: `!draupnir status`,
        msgtype: "m.text",
      });
    });
  });

  it("Users cannot self-service provision when self service provisioning is disabled", async function (this: Context) {
    const config = readTestConfig();
    config.allowSelfServiceProvisioning = false;
    this.appservice = await setupHarnessWithConfig(config);
    const appservice = this.appservice;
    const moderator = await newTestUser(config.homeserver.url, {
      name: { contains: "self-service-disabled" },
    });
    this.moderator = moderator;
    const roomWeWantProtecting = await moderator.createRoom();
    const roomsInvitedTo: string[] = [];

    moderator.on("room.invite", (roomId: string) => {
      roomsInvitedTo.push(roomId);
    });

    await moderator.start();
    await moderator.inviteUser(
      appservice.bridge.getBot().getUserId(),
      roomWeWantProtecting
    );

    // Give the appservice time to process the invite and ensure no management/policy rooms were created.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (roomsInvitedTo.length !== 0) {
      throw new TypeError(
        `Expected no self-service provisioning invites when disabled, got ${roomsInvitedTo.length}`
      );
    }
  });

  it("Allows provisioning multiple bots per user up to maxDraupnirsPerUser", async function (this: Context) {
    const config = readTestConfig();
    config.maxDraupnirsPerUser = 2;
    this.appservice = await setupHarnessWithConfig(config);
    const appservice = this.appservice;
    const allowedUser = await newTestUser(config.homeserver.url, {
      name: { contains: "multi-allowed" },
    });
    const allowedUserID = (await allowedUser.getUserId()) as StringUserID;

    (await appservice.accessControl.allow(allowedUserID)).expect(
      "Failed to allow user to provision bot"
    );

    (
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID)
    ).expect("Failed to provision first bot for user");

    (
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID)
    ).expect("Failed to provision second bot for user");

    const thirdProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID);
    if (isOk(thirdProvisionResult)) {
      throw new TypeError(
        `Expected provisioning to fail after reaching limit for user ${allowedUserID}`
      );
    }

    allowedUser.stop();
  });

  it("Admin provisioning path can bypass per-user allocation limit", async function (this: Context) {
    const config = readTestConfig();
    config.maxDraupnirsPerUser = 1;
    this.appservice = await setupHarnessWithConfig(config);
    const appservice = this.appservice;
    const allowedUser = await newTestUser(config.homeserver.url, {
      name: { contains: "admin-bypass-allowed" },
    });
    const allowedUserID = (await allowedUser.getUserId()) as StringUserID;

    (await appservice.accessControl.allow(allowedUserID)).expect(
      "Failed to allow admin bypass user"
    );

    (
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID)
    ).expect("Failed to provision initial bot for admin bypass user");

    (
      await appservice.commands.sendTextCommand(
        "@test-admin:localhost:9999" as StringUserID,
        `!admin provision ${allowedUserID}`
      )
    ).expect("Failed to provision bot while bypassing user limit");

    const ownedDraupnirs =
      await appservice.draupnirManager.getOwnedDraupnir(allowedUserID);
    if (ownedDraupnirs.length !== 2) {
      throw new TypeError(
        `Expected 2 draupnirs after admin bypass, got ${ownedDraupnirs.length}`
      );
    }

    allowedUser.stop();
  });
});
