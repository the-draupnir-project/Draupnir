// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// 1. We need to test glob on user, literal on user, and server on user all get
// removed when using unban.
// 1.a. We need to test that nothing happens when you just enter the command
//      without confirmation
// 1.b. We need to test the effects happen after confirmation
// 2. We need to test that invite behaviour is optional.
// 3. We need to test that inviting and unbanning works even when
//    There are no policies.
//   This probably all needs to be an integration test... So that we can
//   Check the rendering.

import {
  Membership,
  PolicyRoomEditor,
  PolicyRuleType,
  Recommendation,
} from "matrix-protection-suite";
import { Draupnir } from "../../../src/Draupnir";
import {
  MatrixRoomReference,
  StringRoomID,
  StringUserID,
  userLocalpart,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import { newTestUser } from "../clientHelper";
import {
  UnbanMembersPreview,
  UnbanMembersResult,
} from "../../../src/commands/unban/Unban";
import expect from "expect";

async function createProtectedRoomsSetWithBan(
  draupnir: Draupnir,
  userToBanUserID: StringUserID,
  { numberOfRooms }: { numberOfRooms: number }
): Promise<StringRoomID[]> {
  return await Promise.all(
    [...Array(numberOfRooms)].map(async (_) => {
      const roomID = (await draupnir.client.createRoom()) as StringRoomID;
      const room = MatrixRoomReference.fromRoomID(roomID, []);
      (
        await draupnir.clientPlatform
          .toRoomBanner()
          .banUser(room, userToBanUserID, "spam")
      ).expect("Should be able to ban the user from the room");
      (
        await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(room)
      ).expect("Should be able to protect the newly created room");
      return roomID;
    })
  );
}

async function createPoliciesBanningUser(
  policyRoomEditor: PolicyRoomEditor,
  userToBanUserID: StringUserID
): Promise<void> {
  (
    await policyRoomEditor.createPolicy(
      PolicyRuleType.Server,
      Recommendation.Ban,
      userServerName(userToBanUserID),
      "spam",
      {}
    )
  ).expect("Should be able to create the server policy");
  (
    await policyRoomEditor.createPolicy(
      PolicyRuleType.User,
      Recommendation.Ban,
      `@${userLocalpart(userToBanUserID)}:*`,
      "spam",
      {}
    )
  ).expect("Should be able to create a glob policy");
  (
    await policyRoomEditor.createPolicy(
      PolicyRuleType.User,
      Recommendation.Ban,
      userToBanUserID,
      "spam",
      {}
    )
  ).expect("Should be able to ban the user directly");
}

async function createWatchedPolicyRoom(
  draupnir: Draupnir
): Promise<StringRoomID> {
  const policyRoomID = (await draupnir.client.createRoom()) as StringRoomID;
  (
    await draupnir.protectedRoomsSet.watchedPolicyRooms.watchPolicyRoomDirectly(
      MatrixRoomReference.fromRoomID(policyRoomID)
    )
  ).expect("Should be able to watch the new policy room");
  return policyRoomID;
}

describe("unbanCommandTest", function () {
  it(
    "Should be able to unban members to protected rooms, removing all policies that will target them",
    async function (this: DraupnirTestContext) {
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`setup didn't run properly`);
      }
      const falsePositiveUser = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "accidentally-banned" },
      });
      const falsePositiveUserID =
        (await falsePositiveUser.getUserId()) as StringUserID;
      const protectedRooms = await createProtectedRoomsSetWithBan(
        draupnir,
        falsePositiveUserID,
        { numberOfRooms: 5 }
      );
      const policyRoomID = await createWatchedPolicyRoom(draupnir);
      const policyRoomEditor = (
        await draupnir.policyRoomManager.getPolicyRoomEditor(
          MatrixRoomReference.fromRoomID(policyRoomID)
        )
      ).expect(
        "Should be able to get a policy room editor for the newly created policy room"
      );
      await createPoliciesBanningUser(policyRoomEditor, falsePositiveUserID);
      // wait for policies to be detected.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now we can use the unban command to test the preview has no effects
      // So the way this can work is we can send the command, get back the event and just know that we can send 'OK' and 'Cancel' to it later and it'll work.
      const previewResult = (
        await draupnir.sendTextCommand(
          draupnir.clientUserID,
          `!draupnir unban ${falsePositiveUserID}`
        )
      ).expect(
        "We should have been able to get a preview"
      ) as UnbanMembersPreview;
      expect(previewResult.membersToUnban.length).toBe(1); // hmm we're going to have to put the user on a different server...
      expect(previewResult.policyMatchesToRemove.length).toBe(1);
      const listMatches = previewResult.policyMatchesToRemove.at(0);
      if (listMatches === undefined) {
        throw new TypeError("We should have some matches");
      }
      expect(listMatches.matches.length).toBe(3);
      const falsePositiveMember = previewResult.membersToUnban.at(0);
      if (falsePositiveMember === undefined) {
        throw new TypeError("We should have some details here");
      }
      expect(falsePositiveMember.roomsBannedFrom.length).toBe(5);
      expect(falsePositiveMember.roomsToInviteTo.length).toBe(0);
      expect(falsePositiveMember.member).toBe(falsePositiveUserID);
      // now checked that the user is still banned in all 5 rooms
      for (const roomID of protectedRooms) {
        const membershipRevision =
          draupnir.protectedRoomsSet.setRoomMembership.getRevision(roomID);
        if (membershipRevision === undefined) {
          throw new TypeError(
            "Unable to find membership revision for a protected room, shouldn't happen"
          );
        }
        expect(
          membershipRevision.membershipForUser(falsePositiveUserID)?.membership
        ).toBe(Membership.Ban);
      }
      (
        await draupnir.sendTextCommand(
          draupnir.clientUserID,
          `!draupnir unban ${falsePositiveUserID} --no-confirm`
        )
      ).expect(
        "We should have been able to run the command"
      ) as UnbanMembersResult;
      // wait for events to come down sync
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // now check that they are unbanned
      for (const roomID of protectedRooms) {
        const membershipRevision =
          draupnir.protectedRoomsSet.setRoomMembership.getRevision(roomID);
        if (membershipRevision === undefined) {
          throw new TypeError(
            "Unable to find membership revision for a protected room, shouldn't happen"
          );
        }
        expect(
          membershipRevision.membershipForUser(falsePositiveUserID)?.membership
        ).toBe(Membership.Leave);
      }
      // verify the policies are removed.
      const policyRevision =
        draupnir.protectedRoomsSet.watchedPolicyRooms.currentRevision;
      expect(policyRevision.allRules.length).toBe(0);

      // (Bonus) now check that if we run the command again, then the user will be reinvited even though they have been unbanned.
      const inviteResult = (
        await draupnir.sendTextCommand(
          draupnir.clientUserID,
          `!draupnir unban ${falsePositiveUserID} --no-confirm --invite`
        )
      ).expect(
        "We should have been able to run the command"
      ) as UnbanMembersResult;
      expect(inviteResult.usersInvited.map.size).toBe(1);
      expect(inviteResult.membersToUnban.at(0)?.roomsToInviteTo.length).toBe(5);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      for (const roomID of protectedRooms) {
        const membershipRevision =
          draupnir.protectedRoomsSet.setRoomMembership.getRevision(roomID);
        if (membershipRevision === undefined) {
          throw new TypeError(
            "Unable to find membership revision for a protected room, shouldn't happen"
          );
        }
        expect(
          membershipRevision.membershipForUser(falsePositiveUserID)?.membership
        ).toBe(Membership.Invite);
      }
    } as unknown as Mocha.AsyncFunc
  );
  it("Unbans users even when there are no policies", async function (
    this: DraupnirTestContext
  ) {
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`setup didn't run properly`);
    }
    const falsePositiveUser = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "accidentally-banned" },
    });
    const falsePositiveUserID =
      (await falsePositiveUser.getUserId()) as StringUserID;
    const protectedRooms = await createProtectedRoomsSetWithBan(
      draupnir,
      falsePositiveUserID,
      { numberOfRooms: 5 }
    );
    // verify that there are no policies.
    const policyRevision =
      draupnir.protectedRoomsSet.watchedPolicyRooms.currentRevision;
    expect(policyRevision.allRules.length).toBe(0);
    (
      await draupnir.sendTextCommand(
        draupnir.clientUserID,
        `!draupnir unban ${falsePositiveUserID} --no-confirm`
      )
    ).expect(
      "We should have been able to run the command"
    ) as UnbanMembersResult;
    // wait for events to come down sync
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // now check that they are unbanned
    for (const roomID of protectedRooms) {
      const membershipRevision =
        draupnir.protectedRoomsSet.setRoomMembership.getRevision(roomID);
      if (membershipRevision === undefined) {
        throw new TypeError(
          "Unable to find membership revision for a protected room, shouldn't happen"
        );
      }
      expect(
        membershipRevision.membershipForUser(falsePositiveUserID)?.membership
      ).toBe(Membership.Leave);
    }
  } as unknown as Mocha.AsyncFunc);
  it(
    "Unbans and reinvites users when the invite option is provided",
    async function (this: DraupnirTestContext) {
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`setup didn't run properly`);
      }
      const falsePositiveUser = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "accidentally-banned" },
      });
      const falsePositiveUserID =
        (await falsePositiveUser.getUserId()) as StringUserID;
      const protectedRooms = await createProtectedRoomsSetWithBan(
        draupnir,
        falsePositiveUserID,
        { numberOfRooms: 5 }
      );

      // Now we can use the unban command to test the preview has no effects
      // So the way this can work is we can send the command, get back the event and just know that we can send 'OK' and 'Cancel' to it later and it'll work.
      const previewResult = (
        await draupnir.sendTextCommand(
          draupnir.clientUserID,
          `!draupnir unban ${falsePositiveUserID} --invite`
        )
      ).expect(
        "We should have been able to get a preview"
      ) as UnbanMembersPreview;
      expect(previewResult.membersToUnban.length).toBe(1); // hmm we're going to have to put the user on a different server...
      expect(previewResult.policyMatchesToRemove.length).toBe(0);
      const falsePositiveMember = previewResult.membersToUnban.at(0);
      if (falsePositiveMember === undefined) {
        throw new TypeError("We should have some details here");
      }
      expect(falsePositiveMember.roomsBannedFrom.length).toBe(5);
      expect(falsePositiveMember.roomsToInviteTo.length).toBe(5);
      expect(falsePositiveMember.member).toBe(falsePositiveUserID);
      // now checked that the user is still banned in all 5 rooms
      for (const roomID of protectedRooms) {
        const membershipRevision =
          draupnir.protectedRoomsSet.setRoomMembership.getRevision(roomID);
        if (membershipRevision === undefined) {
          throw new TypeError(
            "Unable to find membership revision for a protected room, shouldn't happen"
          );
        }
        expect(
          membershipRevision.membershipForUser(falsePositiveUserID)?.membership
        ).toBe(Membership.Ban);
      }
      (
        await draupnir.sendTextCommand(
          draupnir.clientUserID,
          `!draupnir unban ${falsePositiveUserID} --invite --no-confirm`
        )
      ).expect(
        "We should have been able to run the command"
      ) as UnbanMembersResult;
      // wait for events to come down sync
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // now check that they are unbanned
      for (const roomID of protectedRooms) {
        const membershipRevision =
          draupnir.protectedRoomsSet.setRoomMembership.getRevision(roomID);
        if (membershipRevision === undefined) {
          throw new TypeError(
            "Unable to find membership revision for a protected room, shouldn't happen"
          );
        }
        expect(
          membershipRevision.membershipForUser(falsePositiveUserID)?.membership
        ).toBe(Membership.Invite);
      }
    } as unknown as Mocha.AsyncFunc
  );
});
