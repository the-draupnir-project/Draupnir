// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import expect from "expect";
import { newTestUser } from "./clientHelper";
import { getFirstEventMatching } from "./commands/commandUtils";
import { DraupnirTestContext, draupnirClient } from "./mjolnirSetupUtils";
import {
  MembershipChangeType,
  NoticeMessageContent,
  PolicyRuleType,
  RoomMessage,
  Value,
  findProtection,
} from "matrix-protection-suite";
import {
  MatrixRoomReference,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

// We will need to disable this in tests that are banning people otherwise it will cause
// mocha to hang for awhile until it times out waiting for a response to a prompt.
describe("Ban propagation test", function () {
  it("Should be enabled by default", async function (
    this: DraupnirTestContext
  ) {
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`setup didn't run properly`);
    }
    const banPropagationProtection = findProtection("BanPropagationProtection");
    if (banPropagationProtection === undefined) {
      throw new TypeError(
        `should be able to find the ban propagation protection`
      );
    }
    expect(
      draupnir.protectedRoomsSet.protections.isEnabledProtection(
        banPropagationProtection
      )
    ).toBeTruthy();
  } as unknown as Mocha.AsyncFunc);
  it(
    "Should prompt to add bans to a policy list, then add the ban",
    async function (this: DraupnirTestContext) {
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`setup didn't run properly`);
      }
      const draupnirMatrixClient = draupnirClient();
      if (draupnirMatrixClient === null) {
        throw new TypeError(`setup didn't run properly`);
      }
      const moderator = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "moderator" },
      });
      const spammer = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "spam" },
      });
      const spamUserID = (await spammer.getUserId()) as StringUserID;
      await moderator.joinRoom(draupnir.managementRoomID);
      const protectedRooms = await Promise.all(
        [...Array(5)].map(async (_) => {
          const room = await moderator.createRoom({
            invite: [draupnir.clientUserID, spamUserID],
          });
          await draupnir.client.joinRoom(room);
          await moderator.setUserPowerLevel(draupnir.clientUserID, room, 100);
          await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
            MatrixRoomReference.fromRoomID(room as StringRoomID)
          );
          await spammer.joinRoom(room);
          return room;
        })
      );
      // create a policy list so that we can check it for a user rule later
      const policyListId = await moderator.createRoom({
        invite: [draupnir.clientUserID],
      });
      await moderator.setUserPowerLevel(
        draupnir.clientUserID,
        policyListId,
        100
      );
      await draupnir.client.joinRoom(policyListId);
      await draupnir.protectedRoomsSet.watchedPolicyRooms.watchPolicyRoomDirectly(
        MatrixRoomReference.fromRoomID(policyListId as StringRoomID)
      );

      // check for the prompt
      const promptEvent = await getFirstEventMatching({
        matrix: draupnirMatrixClient,
        targetRoom: draupnir.managementRoomID,
        lookAfterEvent: async function () {
          // ban a user in one of our protected rooms using the moderator
          await moderator.banUser(spamUserID, protectedRooms[0], "spam");
          return undefined;
        },
        predicate: function (event: unknown): boolean {
          return (
            Value.Check(RoomMessage, event) &&
            Value.Check(NoticeMessageContent, event.content) &&
            event["content"]["body"].startsWith("The user")
          );
        },
      });
      // select the prompt
      await moderator.unstableApis.addReactionToEvent(
        draupnir.managementRoomID,
        promptEvent["event_id"],
        "1️⃣"
      );
      // check the policy list, after waiting a few seconds.
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const policyListRevisionAfterBan =
        draupnir.protectedRoomsSet.watchedPolicyRooms.currentRevision;
      const rules = policyListRevisionAfterBan.allRulesMatchingEntity(
        spamUserID,
        PolicyRuleType.User
      );
      expect(rules.length).toBe(1);
      expect(rules[0]?.entity).toBe(spamUserID);
      expect(rules[0]?.reason).toBe("spam");

      // now unban them >:3
      const unbanPrompt = await getFirstEventMatching({
        matrix: draupnirMatrixClient,
        targetRoom: draupnir.managementRoomID,
        lookAfterEvent: async function () {
          // ban a user in one of our protected rooms using the moderator
          await moderator.unbanUser(spamUserID, protectedRooms[0]);
          return undefined;
        },
        predicate: function (event: unknown): boolean {
          return (
            Value.Check(RoomMessage, event) &&
            Value.Check(NoticeMessageContent, event.content) &&
            event["content"]["body"].startsWith("The user")
          );
        },
      });

      await moderator.unstableApis.addReactionToEvent(
        draupnir.managementRoomID,
        unbanPrompt["event_id"],
        "unban from all"
      );
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const policyListRevisionAfterUnBan =
        draupnir.protectedRoomsSet.watchedPolicyRooms.currentRevision;

      const rulesAfterUnban =
        policyListRevisionAfterUnBan.allRulesMatchingEntity(
          spamUserID,
          PolicyRuleType.User
        );
      expect(rulesAfterUnban.length).toBe(0);
      for (const room of protectedRooms) {
        const membershipRevision =
          draupnir.protectedRoomsSet.setRoomMembership.getRevision(
            room as StringRoomID
          );
        if (membershipRevision === undefined) {
          throw new TypeError(
            `We should be able to get the membership for the protected room`
          );
        }
        expect(
          membershipRevision.membershipForUser(spamUserID)?.membershipChangeType
        ).toBe(MembershipChangeType.Unbanned);
      }
    } as unknown as Mocha.AsyncFunc
  );
});
