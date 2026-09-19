// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { CommandExecutorHelper } from "@the-draupnir-project/interface-manager";
import {
  MatrixUserID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  Ok,
  PolicyRoomEditor,
  PolicyRoomManager,
  PolicyRuleType,
  PowerLevelsEventContent,
  RoomResolver,
  describeProtectedRoomsSet,
  isError,
  isOk,
  randomEventID,
} from "@the-draupnir-project/matrix-protection-suite";
import { createMock } from "ts-auto-mock";
import expect from "expect";
import {
  DraupnirTakedownCommand,
  TakedownPolicyPreview,
} from "../../../src/commands/server-admin/Takedown";

const DraupnirUserID = `@draupnir:ourserver.example.com` as StringUserID;

async function createProtectedRooms() {
  return await describeProtectedRoomsSet({
    rooms: [
      {
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

const roomResolver = createMock<RoomResolver>({});

describe("Test the DraupnirTakedownCommand", function () {
  it("Includes the parsed --expires in the preview", async function () {
    const { protectedRoomsSet } = await createProtectedRooms();
    const policyRoom = protectedRoomsSet.allProtectedRooms[0];
    if (policyRoom === undefined) {
      throw new TypeError(
        `There should be a policy room available from the setup`
      );
    }
    const policyRoomManager = createMock<PolicyRoomManager>({
      async getPolicyRoomEditor(room) {
        return Ok(createMock<PolicyRoomEditor>({ room }));
      },
    });
    const beforeCall = Date.now();
    const takedownResult = await CommandExecutorHelper.execute(
      DraupnirTakedownCommand,
      {
        policyRoomManager,
        roomResolver,
        watchedPolicyRooms: protectedRoomsSet.watchedPolicyRooms,
        defaultReasons: [],
        clientUserID: DraupnirUserID,
        hashStore: undefined,
        detailsProvider: undefined,
        enabledProtections: [],
      },
      {
        keywords: { expires: "5m" },
      },
      MatrixUserID.fromUserID("@spam:spam.example.com" as StringUserID),
      policyRoom
    );
    if (isError(takedownResult)) {
      throw new TypeError("Expected a preview result, not an error");
    }
    const preview = takedownResult.ok as TakedownPolicyPreview;
    if (preview.expiry === undefined) {
      throw new TypeError("Expected an expiry to be present in the preview");
    }
    expect(preview.expiry).toBeGreaterThan(beforeCall + 4 * 60 * 1000);
    expect(preview.expiry).toBeLessThan(beforeCall + 6 * 60 * 1000);
  });

  it("Passes the parsed --expires to takedownEntity when --no-confirm is set", async function () {
    const { protectedRoomsSet } = await createProtectedRooms();
    const policyRoom = protectedRoomsSet.allProtectedRooms[0];
    if (policyRoom === undefined) {
      throw new TypeError(
        `There should be a policy room available from the setup`
      );
    }
    const beforeCall = Date.now();
    let capturedExpiry: number | undefined;
    const policyRoomManager = createMock<PolicyRoomManager>({
      async getPolicyRoomEditor(room) {
        return Ok(
          createMock<PolicyRoomEditor>({
            room,
            async takedownEntity(ruleType, entity, options) {
              expect(ruleType).toBe(PolicyRuleType.User);
              expect(entity).toBe("@spam:spam.example.com");
              capturedExpiry = options.expiry;
              return Ok(randomEventID());
            },
          })
        );
      },
    });
    const takedownResult = await CommandExecutorHelper.execute(
      DraupnirTakedownCommand,
      {
        policyRoomManager,
        roomResolver,
        watchedPolicyRooms: protectedRoomsSet.watchedPolicyRooms,
        defaultReasons: [],
        clientUserID: DraupnirUserID,
        hashStore: undefined,
        detailsProvider: undefined,
        enabledProtections: [],
      },
      {
        keywords: { expires: "5m", "no-confirm": true },
      },
      MatrixUserID.fromUserID("@spam:spam.example.com" as StringUserID),
      policyRoom
    );
    expect(isOk(takedownResult)).toBe(true);
    if (capturedExpiry === undefined) {
      throw new TypeError("Expected an expiry to have been captured");
    }
    expect(capturedExpiry).toBeGreaterThan(beforeCall + 4 * 60 * 1000);
    expect(capturedExpiry).toBeLessThan(beforeCall + 6 * 60 * 1000);
  });

  it("Returns an error and does not preview when --expires is invalid", async function () {
    const { protectedRoomsSet } = await createProtectedRooms();
    const policyRoom = protectedRoomsSet.allProtectedRooms[0];
    if (policyRoom === undefined) {
      throw new TypeError(
        `There should be a policy room available from the setup`
      );
    }
    const policyRoomManager = createMock<PolicyRoomManager>({
      async getPolicyRoomEditor() {
        throw new TypeError(
          "We shouldn't be getting this far with an invalid --expires"
        );
      },
    });
    const takedownResult = await CommandExecutorHelper.execute(
      DraupnirTakedownCommand,
      {
        policyRoomManager,
        roomResolver,
        watchedPolicyRooms: protectedRoomsSet.watchedPolicyRooms,
        defaultReasons: [],
        clientUserID: DraupnirUserID,
        hashStore: undefined,
        detailsProvider: undefined,
        enabledProtections: [],
      },
      {
        keywords: { expires: "not-a-valid-expiry" },
      },
      MatrixUserID.fromUserID("@spam:spam.example.com" as StringUserID),
      policyRoom
    );
    expect(isError(takedownResult)).toBe(true);
  });
});
