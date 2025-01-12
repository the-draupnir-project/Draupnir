// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { CommandExecutorHelper } from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomID,
  MatrixRoomReference,
  MatrixUserID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  Membership,
  Ok,
  PolicyRoomEditor,
  PolicyRoomManager,
  PolicyRuleType,
  PowerLevelsEventContent,
  Recommendation,
  RoomInviter,
  RoomResolver,
  RoomUnbanner,
  describeProtectedRoomsSet,
  isError,
} from "matrix-protection-suite";
import { createMock } from "ts-auto-mock";
import expect from "expect";
import { DraupnirUnbanCommand } from "../../../src/commands/Unban";
import ManagementRoomOutput from "../../../src/managementroom/ManagementRoomOutput";
import { UnlistedUserRedactionQueue } from "../../../src/queues/UnlistedUserRedactionQueue";

const DraupnirUserID = `@draupnir:ourserver.example.com` as StringUserID;
const ExistingBanUserID = "@existing-spam:spam.example.com" as StringUserID;

async function createProtectedRooms() {
  return await describeProtectedRoomsSet({
    rooms: [
      {
        membershipDescriptions: [
          {
            sender: DraupnirUserID,
            target: ExistingBanUserID,
            membership: Membership.Ban,
          },
        ],
        policyDescriptions: [
          {
            entity: ExistingBanUserID,
            recommendation: Recommendation.Ban,
            type: PolicyRuleType.User,
          },
        ],
        stateDescriptions: [
          {
            sender: DraupnirUserID,
            type: "m.room.power_levels",
            state_key: "",
            content: {
              users: {
                [DraupnirUserID]: 100,
              },
            } satisfies PowerLevelsEventContent,
          },
        ],
      },
    ],
  });
}

describe("Test the DraupnirUnbanCommand", function () {
  const roomResolver = createMock<RoomResolver>({
    async resolveRoom(roomReference) {
      if (roomReference instanceof MatrixRoomID) {
        return Ok(roomReference);
      }
      throw new TypeError(`We don't really expect to resolve anything`);
    },
  });
  it("Will add a user to the policy list when they are banned", async function () {
    const { protectedRoomsSet, policyRoomManager, roomStateManager } =
      await createProtectedRooms();
    const roomUnbanner = createMock<RoomUnbanner>({
      async unbanUser(roomOrRoomID, userID, reason) {
        const room =
          roomOrRoomID instanceof MatrixRoomID
            ? roomOrRoomID
            : MatrixRoomReference.fromRoomID(roomOrRoomID);
        expect(userID).toBe(ExistingBanUserID);
        roomStateManager.appendState({
          room,
          membershipDescriptions: [
            {
              sender: DraupnirUserID,
              target: userID,
              membership: Membership.Leave,
              ...(reason === undefined ? {} : { reason }),
            },
          ],
        });
        return Ok(undefined);
      },
    });
    const policyRoom = protectedRoomsSet.allProtectedRooms[0];
    if (policyRoom === undefined) {
      throw new TypeError(
        `There should be a policy room available from the setup`
      );
    }
    const revisionIssuer =
      await policyRoomManager.getPolicyRoomRevisionIssuer(policyRoom);
    if (isError(revisionIssuer)) {
      throw new TypeError(`Test is wrong`);
    }
    const mockPolicyRoomManager = createMock<PolicyRoomManager>({
      async getPolicyRoomEditor(room) {
        expect(room).toBe(policyRoom);
        return Ok(
          createMock<PolicyRoomEditor>({
            async unbanEntity(ruleType, entity) {
              expect(ruleType).toBe(PolicyRuleType.User);
              expect(entity).toBe(ExistingBanUserID);
              return Ok(revisionIssuer.ok.currentRevision.allRules());
            },
          })
        );
      },
    });
    const banResult = await CommandExecutorHelper.execute(
      DraupnirUnbanCommand,
      {
        policyRoomManager: mockPolicyRoomManager,
        setMembership: protectedRoomsSet.setRoomMembership,
        managementRoomOutput: createMock<ManagementRoomOutput>(),
        roomResolver,
        issuerManager: protectedRoomsSet.issuerManager,
        clientUserID: `@draupnir:ourserver.example.com` as StringUserID,
        noop: false,
        roomUnbanner,
        unlistedUserRedactionQueue: createMock<UnlistedUserRedactionQueue>(),
        roomInviter: createMock<RoomInviter>({
          async inviteUser() {
            return Ok(undefined);
          },
        }),
      },
      {
        rest: ["spam"],
      },
      MatrixUserID.fromUserID(ExistingBanUserID),
      policyRoom
    );
    expect(banResult.isOkay).toBe(true);
    const membership = protectedRoomsSet.setRoomMembership.getRevision(
      policyRoom.toRoomIDOrAlias()
    );
    if (membership === undefined) {
      throw new TypeError(
        `We should be able to get the membership for the protected policy room`
      );
    }
    expect(membership.membershipForUser(ExistingBanUserID)?.membership).toBe(
      Membership.Leave
    );
  });
});
