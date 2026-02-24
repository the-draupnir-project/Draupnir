// SPDX-FileCopyrightText: 2023-2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { findProtection } from "../../Protection";
import "./MemberBanSynchronisation";
import { isError, isOk } from "../../../Interface/Action";
import {
  randomRoomID,
  randomUserID,
} from "../../../TestUtilities/EventGeneration";
import { describeProtectedRoomsSet } from "../../../StateTracking/DeclareRoomState";
import {
  Membership,
  MembershipChangeType,
} from "../../../Membership/MembershipChange";
import waitForExpect from "wait-for-expect";
import { PolicyRuleType } from "../../../MatrixTypes/PolicyEvents";
import { ProtectedRoomsSet } from "../../ProtectedRoomsSet";
import {
  MemberBanSynchronisationProtection,
  MemberBanSynchronisationProtectionCapabilities,
} from "./MemberBanSynchronisation";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { StandardLifetime } from "../../../Interface/Lifetime";
import { SimulatedUserConsequences } from "../../Capability/StandardCapability/SimulatedUserConsequences";

async function createMemberBanSynchronisationProtection(
  capabilities: MemberBanSynchronisationProtectionCapabilities,
  protectedRoomsSet: ProtectedRoomsSet
): Promise<MemberBanSynchronisationProtection> {
  const description = findProtection("MemberBanSynchronisationProtection");
  if (description === undefined) {
    throw new TypeError(
      "Should be able to find the member ban synchronisation protection"
    );
  }
  const protectionResult = await description.factory(
    description,
    // TODO: replace this when protected rooms set gets a lifetime.
    new StandardLifetime(),
    protectedRoomsSet,
    undefined,
    capabilities,
    {}
  );
  if (isError(protectionResult)) {
    throw new TypeError("Should be able to construct the protection");
  }
  // cba to add a generic to the protection description so the factory can have
  // a generic return type. Shouldn't be this level of disconect between types
  // and the real bullshit getting annoyed now whenver i have to do any meta
  // programming.
  return protectionResult.ok as unknown as MemberBanSynchronisationProtection;
}

// handleMembershipChange
test("Membership changes that should result in a ban when matching an existing policy", async function () {
  const policyRoom = randomRoomID([]);
  const protectedRoom = randomRoomID([]);
  const changesToTest = [
    MembershipChangeType.Invited,
    MembershipChangeType.Joined,
    MembershipChangeType.Knocked,
    MembershipChangeType.Rejoined,
  ];
  const usersToTest = changesToTest.map((_change) => randomUserID());
  const rejoiningUser = usersToTest[3];
  if (rejoiningUser === undefined) {
    throw new TypeError(`Test setup incorrectly`);
  }
  const { protectedRoomsSet, roomStateManager, roomMembershipManager } =
    await describeProtectedRoomsSet({
      rooms: [
        {
          room: protectedRoom,
          membershipDescriptions: [
            {
              // we need this for the user who will rejoin the room.
              sender: rejoiningUser,
              membership: Membership.Leave,
            },
          ],
        },
      ],
      lists: [
        {
          room: policyRoom,
          policyDescriptions: usersToTest.map((userID) => ({
            entity: userID,
            type: PolicyRuleType.User,
          })),
        },
      ],
    });
  const userConsequences = new SimulatedUserConsequences(
    protectedRoomsSet.setRoomMembership
  );
  const consequenceSpy = jest.spyOn(
    userConsequences,
    "consequenceForUserInRoom"
  );
  const protection = await createMemberBanSynchronisationProtection(
    { userConsequences },
    protectedRoomsSet
  );
  const membershipRevisionIssuer =
    roomMembershipManager.getFakeRoomMembershpRevisionIssuer(protectedRoom);
  roomStateManager.appendState({
    room: protectedRoom,
    membershipDescriptions: changesToTest.map((changeType, index) => {
      const membership = (() => {
        switch (changeType) {
          case MembershipChangeType.Invited:
            return Membership.Invite;
          case MembershipChangeType.Joined:
          case MembershipChangeType.Rejoined:
            return Membership.Join;
          case MembershipChangeType.Knocked:
            return Membership.Knock;
          default:
            throw new TypeError(`Unexpected membership change type in test`);
        }
      })();
      const userToTest = usersToTest[index];
      if (userToTest === undefined) {
        throw new TypeError(
          `There aren't enough test users for the changes to test`
        );
      }
      return {
        state_key: userToTest,
        sender: userToTest,
        membership: membership,
      };
    }),
  });
  await waitForExpect(() => {
    expect(membershipRevisionIssuer.getNumberOfRevisions()).toBe(1);
  });
  const revisionEntry = membershipRevisionIssuer.getLastRevision();
  const protectionHandlerResult = await protection.handleMembershipChange.call(
    protection,
    revisionEntry[0],
    revisionEntry[1]
  );
  expect(isOk(protectionHandlerResult)).toBeTruthy();
  expect(consequenceSpy).toHaveBeenCalledTimes(usersToTest.length);
});

// handlePolicyRevision
// We need to test the consequence method itself in another test?
test("A policy change banning a user on a directly watched list will call the consequence to update for the revision", async function () {
  const spammerToBanUserID = `@spam:example.com` as StringUserID;
  const policyRoom = randomRoomID([]);
  const { protectedRoomsSet, roomStateManager, policyRoomManager } =
    await describeProtectedRoomsSet({
      rooms: [
        {
          membershipDescriptions: [
            {
              sender: spammerToBanUserID,
              membership: Membership.Join,
            },
          ],
        },
      ],
      lists: [
        {
          room: policyRoom,
        },
      ],
    });

  const userConsequences = new SimulatedUserConsequences(
    protectedRoomsSet.setRoomMembership
  );
  const consequenceSpy = jest.spyOn(
    userConsequences,
    "consequenceForUsersInRoomSet"
  );

  const protection = await createMemberBanSynchronisationProtection(
    { userConsequences },
    protectedRoomsSet
  );

  const policyRoomRevisionIssuer =
    policyRoomManager.getFakePolicyRoomRevisionIssuer(policyRoom);
  roomStateManager.appendState({
    room: policyRoom,
    policyDescriptions: [
      { entity: spammerToBanUserID, type: PolicyRuleType.User },
    ],
  });
  await waitForExpect(() => {
    expect(policyRoomRevisionIssuer.getNumberOfRevisions()).toBe(1);
  });
  const revision =
    protectedRoomsSet.setPoliciesMatchingMembership.currentRevision;
  const protectionHandlerResult =
    await protection.synchroniseWithRevision(revision);
  expect(isOk(protectionHandlerResult)).toBeTruthy();
  expect(consequenceSpy).toHaveBeenCalled();
  expect(revision.allRulesMatchingMember(spammerToBanUserID, {})).toHaveLength(
    1
  );
});
