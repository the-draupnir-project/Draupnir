// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomReference,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { newTestUser } from "../clientHelper";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import { RoomTakedownProtection } from "../../../src/protections/RoomTakedown/RoomTakedownProtection";
import expect from "expect";
import { Draupnir } from "../../../src/Draupnir";
import { PolicyRuleType } from "matrix-protection-suite";

async function createWatchedPolicyRoom(
  draupnir: Draupnir
): Promise<StringRoomID> {
  const policyRoomID = (await draupnir.client.createRoom({
    preset: "public_chat",
  })) as StringRoomID;
  (
    await draupnir.protectedRoomsSet.watchedPolicyRooms.watchPolicyRoomDirectly(
      MatrixRoomReference.fromRoomID(policyRoomID)
    )
  ).expect("Should be able to watch the new policy room");
  return policyRoomID;
}

describe("RoomTakedownProtectionTest", function () {
  it("Will takedown a room that is added to the policy list", async function (
    this: DraupnirTestContext
  ) {
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`setup didn't run properly`);
    }
    const moderator = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "moderator" },
    });
    const moderatorUserID = StringUserID(await moderator.getUserId());
    const takedownTarget = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "takedown-target" },
    });
    const takedownTargetRoomID = StringRoomID(
      await takedownTarget.createRoom({
        preset: "public_chat",
      })
    );
    await moderator.joinRoom(draupnir.managementRoomID);
    const policyRoom = await createWatchedPolicyRoom(draupnir);
    (
      await draupnir.sendTextCommand(
        moderatorUserID,
        `!draupnir protections enable ${RoomTakedownProtection.name}`
      )
    ).expect("Should be able to enable the protection");
    (
      await draupnir.sendTextCommand(
        moderatorUserID,
        `!draupnir takedown ${takedownTargetRoomID} ${policyRoom} --no-confirm`
      )
    ).expect("Should be able to create the policy targetting the room");

    // give some time for the room to be takendown, synapse can be quite slow at this...
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(
      draupnir.stores.roomAuditLog?.isRoomTakendown(takedownTargetRoomID)
    ).toBe(true);
    expect(
      (
        await draupnir.clientPlatform
          .toRoomJoiner()
          .joinRoom(takedownTargetRoomID)
      ).isOkay
    ).toBe(false);
  } as unknown as Mocha.AsyncFunc);
  it(
    "Takedown a room through discovery and a revealed Literal policy change",
    async function (this: DraupnirTestContext) {
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`setup didn't run properly`);
      }
      const synapseHTTPAntispam = draupnir.synapseHTTPAntispam;
      if (synapseHTTPAntispam === undefined) {
        throw new TypeError("Setup code is wrong");
      }
      const moderator = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "moderator" },
      });
      const moderatorUserID = StringUserID(await moderator.getUserId());
      const takedownTarget = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "takedown-target" },
      });
      const takedownTargetRoomID = StringRoomID(
        await takedownTarget.createRoom({
          preset: "public_chat",
        })
      );
      await moderator.joinRoom(draupnir.managementRoomID);
      const policyRoom = await createWatchedPolicyRoom(draupnir);
      (
        await draupnir.sendTextCommand(
          moderatorUserID,
          `!draupnir protections enable ${RoomTakedownProtection.name}`
        )
      ).expect("Should be able to enable the protection");

      const policyRoomEditor = (
        await draupnir.policyRoomManager.getPolicyRoomEditor(
          MatrixRoomReference.fromRoomID(policyRoom)
        )
      ).expect("Should be able to get the policy room editor");
      (
        await policyRoomEditor.takedownEntity(
          PolicyRuleType.Room,
          takedownTargetRoomID,
          { shouldHash: true }
        )
      ).expect("Should be able to takedown the room via a policy list editor");
      // give some time for the room to be takendown, synapse can be quite slow at this...
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const bystander = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "bystander" },
      });
      await bystander.joinRoom(takedownTargetRoomID);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(
        draupnir.stores.roomAuditLog?.isRoomTakendown(takedownTargetRoomID)
      ).toBe(true);
      expect(
        (
          await draupnir.clientPlatform
            .toRoomJoiner()
            .joinRoom(takedownTargetRoomID)
        ).isOkay
      ).toBe(false);
    } as unknown as Mocha.AsyncFunc
  );
});
