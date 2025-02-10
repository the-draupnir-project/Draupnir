// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  CommandExecutorHelper,
  MatrixRoomIDPresentationType,
  MatrixUserIDPresentationType,
  PromptRequiredError,
  StandardCommandTable,
} from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomID,
  MatrixUserID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  Ok,
  PolicyRoomEditor,
  PolicyRoomManager,
  PolicyRuleType,
  PowerLevelsEventContent,
  Recommendation,
  RoomResolver,
  describeProtectedRoomsSet,
  isOk,
  randomEventID,
} from "matrix-protection-suite";
import { createMock } from "ts-auto-mock";
import expect from "expect";
import { DraupnirBanCommand } from "../../../src/commands/Ban";

const dummyTable = new StandardCommandTable("test");
const DraupnirUserID = `@draupnir:ourserver.example.com` as StringUserID;

async function createProtectedRooms() {
  return await describeProtectedRoomsSet({
    rooms: [
      {
        policyDescriptions: [
          {
            entity: "@existing-spam:spam.example.com",
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

describe("Test the DraupnirBanCommand", function () {
  const roomResolver = createMock<RoomResolver>({
    async resolveRoom(roomReference) {
      if (roomReference instanceof MatrixRoomID) {
        return Ok(roomReference);
      }
      throw new TypeError(`We don't really expect to resolve anything`);
    },
  });
  it("Will prompt for the policy list when it is missing", async function () {
    const { protectedRoomsSet, policyRoomManager } =
      await createProtectedRooms();
    const banResult = await CommandExecutorHelper.parseAndInvoke(
      dummyTable,
      DraupnirBanCommand,
      {
        policyRoomManager,
        roomResolver,
        issuerManager: protectedRoomsSet.issuerManager,
        defaultReasons: ["spam"],
        clientUserID: `@draupnir:ourserver.example.com` as StringUserID,
        allJoinedRooms: protectedRoomsSet.allProtectedRooms.map((room) =>
          room.toRoomIDOrAlias()
        ),
        protectedRooms: protectedRoomsSet.allProtectedRooms,
      },
      {},
      MatrixUserIDPresentationType.wrap(
        MatrixUserID.fromUserID("@spam:spam.example.com" as StringUserID)
      ),
      undefined // no policy room provided, we expect a prompt.
    );
    if (isOk(banResult)) {
      throw new TypeError(`We expect a prompt error to be returned`);
    }
    if (!(banResult.error instanceof PromptRequiredError)) {
      throw new TypeError(`Expected to have a prompt required error`);
    }
    expect(banResult.error.parameterRequiringPrompt.name).toBe("list");
  });
  it("Will prompt for the reason when it is missing", async function () {
    const { protectedRoomsSet, policyRoomManager } =
      await createProtectedRooms();
    const policyRoom = protectedRoomsSet.allProtectedRooms[0];
    if (policyRoom === undefined) {
      throw new TypeError(
        `There should be a policy room available from the setup`
      );
    }
    const banResult = await CommandExecutorHelper.parseAndInvoke(
      dummyTable,
      DraupnirBanCommand,
      {
        policyRoomManager,
        roomResolver,
        issuerManager: protectedRoomsSet.issuerManager,
        defaultReasons: ["spam"],
        clientUserID: `@draupnir:ourserver.example.com` as StringUserID,
        allJoinedRooms: protectedRoomsSet.allProtectedRooms.map((room) =>
          room.toRoomIDOrAlias()
        ),
        protectedRooms: protectedRoomsSet.allProtectedRooms,
      },
      {},
      MatrixUserIDPresentationType.wrap(
        MatrixUserID.fromUserID("@spam:spam.example.com" as StringUserID)
      ),
      MatrixRoomIDPresentationType.wrap(policyRoom)
    );
    if (isOk(banResult)) {
      throw new TypeError(`We expect a prompt error to be returned`);
    }
    if (!(banResult.error instanceof PromptRequiredError)) {
      throw new TypeError(`Expected to have a prompt required error`);
    }
    expect(banResult.error.parameterRequiringPrompt.name).toBe("reason");
  });
  it("Will add a user to the policy list when they are banned", async function () {
    const { protectedRoomsSet } = await createProtectedRooms();
    const policyRoom = protectedRoomsSet.allProtectedRooms[0];
    if (policyRoom === undefined) {
      throw new TypeError(
        `There should be a policy room available from the setup`
      );
    }
    const policyRoomManager = createMock<PolicyRoomManager>({
      async getPolicyRoomEditor(room) {
        expect(room).toBe(policyRoom);
        return Ok(
          createMock<PolicyRoomEditor>({
            async createPolicy(
              entityType,
              recommendation,
              entity,
              reason,
              _additionalProperties
            ) {
              expect(entityType).toBe(PolicyRuleType.User);
              expect(recommendation).toBe(Recommendation.Ban);
              expect(entity).toBe("@spam:spam.example.com");
              expect(reason).toBe("spam");
              return Ok(randomEventID());
            },
          })
        );
      },
    });
    const banResult = await CommandExecutorHelper.execute(
      DraupnirBanCommand,
      {
        policyRoomManager,
        roomResolver,
        issuerManager: protectedRoomsSet.issuerManager,
        defaultReasons: ["spam"],
        clientUserID: `@draupnir:ourserver.example.com` as StringUserID,
        allJoinedRooms: protectedRoomsSet.allProtectedRooms.map((room) =>
          room.toRoomIDOrAlias()
        ),
        protectedRooms: protectedRoomsSet.allProtectedRooms,
      },
      {
        rest: ["spam"],
      },
      MatrixUserID.fromUserID("@spam:spam.example.com" as StringUserID),
      policyRoom
    );
    expect(banResult.isOkay).toBe(true);
  });
});
