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

import {
  readTestConfig,
  setupHarness,
  setupHarnessWithConfig,
} from "../utils/harness";
import { newTestUser } from "../../integration/clientHelper";
import { getFirstReply } from "../../integration/commands/commandUtils";
import { MatrixClient } from "@vector-im/matrix-bot-sdk";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { isError } from "matrix-protection-suite";
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
    this.appservice = await setupHarness();
    const appservice = this.appservice;
    // create a user to act as the moderator
    const moderator = await newTestUser(config.homeserver.url, {
      name: { contains: "test" },
    });
    const moderatorUserID = await moderator.getUserId();
    const allowResult = await appservice.accessControl.allow(moderatorUserID);
    if (isError(allowResult)) {
      throw allowResult.error;
    }
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

  it("Only users on the appservice allow list can self-provision", async function (this: Context) {
    const config = readTestConfig();
    this.appservice = await setupHarness();
    const appservice = this.appservice;
    const allowedUser = await newTestUser(config.homeserver.url, {
      name: { contains: "allowed" },
    });
    const blockedUser = await newTestUser(config.homeserver.url, {
      name: { contains: "blocked" },
    });
    const allowedUserID = (await allowedUser.getUserId()) as StringUserID;
    const blockedUserID = (await blockedUser.getUserId()) as StringUserID;
    const allowResult = await appservice.accessControl.allow(allowedUserID);
    if (isError(allowResult)) {
      throw allowResult.error;
    }

    const blockedProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnir(blockedUserID);
    if (!isError(blockedProvisionResult)) {
      throw new TypeError(
        `Expected provisioning to fail for non-allow-listed user ${blockedUserID}`
      );
    }

    const allowedProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID);
    if (isError(allowedProvisionResult)) {
      throw allowedProvisionResult.error;
    }

    allowedUser.stop();
    blockedUser.stop();
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
    const allowResult = await appservice.accessControl.allow(allowedUserID);
    if (isError(allowResult)) {
      throw allowResult.error;
    }

    const firstProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID);
    if (isError(firstProvisionResult)) {
      throw firstProvisionResult.error;
    }

    const secondProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID);
    if (isError(secondProvisionResult)) {
      throw secondProvisionResult.error;
    }

    const thirdProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID);
    if (!isError(thirdProvisionResult)) {
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
    const allowResult = await appservice.accessControl.allow(allowedUserID);
    if (isError(allowResult)) {
      throw allowResult.error;
    }

    const firstProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnir(allowedUserID);
    if (isError(firstProvisionResult)) {
      throw firstProvisionResult.error;
    }

    const secondProvisionResult =
      await appservice.draupnirManager.provisionNewDraupnirBypassingUserLimit(
        allowedUserID
      );
    if (isError(secondProvisionResult)) {
      throw secondProvisionResult.error;
    }

    allowedUser.stop();
  });
});
