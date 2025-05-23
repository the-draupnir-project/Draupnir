// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  describeProtectedRoomsSet,
  Membership,
  Ok,
  PolicyRuleType,
  randomRoomID,
  randomUserID,
  Recommendation,
} from "matrix-protection-suite";
import {
  RedactionSynchronisationConsequences,
  StandardRedactionSynchronisation,
} from "../../../src/protections/RedactionSynchronisation";
import { MatrixGlob } from "@the-draupnir-project/matrix-basic-types";
import { createMock } from "ts-auto-mock";
import expect from "expect";

describe("RedactionSynchronisation", function () {
  it("Attempts to retract invitations on permission requirements met", async function () {
    const room = randomRoomID([]);
    const targetUser = randomUserID();
    const { protectedRoomsSet } = await describeProtectedRoomsSet({
      rooms: [
        {
          room,
          membershipDescriptions: [
            {
              sender: targetUser,
              membership: Membership.Leave,
            },
            {
              sender: targetUser,
              membership: Membership.Invite,
              target: randomUserID(),
            },
          ],
        },
      ],
      lists: [
        {
          policyDescriptions: [
            {
              recommendation: Recommendation.Ban,
              entity: targetUser,
              reason: "spam",
              type: PolicyRuleType.User,
            },
          ],
        },
      ],
    });
    let mockMethodCalls = 0;
    const mockConsequences = createMock<RedactionSynchronisationConsequences>({
      async redactMessagesIn(userIDOrGlob, _reason, _roomIDs) {
        expect(userIDOrGlob).toBe(targetUser);
        mockMethodCalls += 1;
        return Ok(undefined);
      },
      async rejectInvite(roomID, sender, _receiver, _reason) {
        expect(roomID).toBe(room.toRoomIDOrAlias());
        expect(sender).toBe(targetUser);
        mockMethodCalls += 1;
        return Ok(undefined);
      },
    });
    const redactionSynronisationService = new StandardRedactionSynchronisation(
      [new MatrixGlob("spam")],
      mockConsequences,
      protectedRoomsSet.watchedPolicyRooms,
      protectedRoomsSet.setRoomMembership,
      protectedRoomsSet.setPoliciesMatchingMembership
    );
    redactionSynronisationService.handlePermissionRequirementsMet(
      room.toRoomIDOrAlias()
    );
    expect(mockMethodCalls).toBe(1);
  });
});
