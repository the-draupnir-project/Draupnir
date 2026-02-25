// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomReference,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Draupnir } from "../../../src/Draupnir";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import { newTestUser } from "../clientHelper";
import { BlockInvitationsOnServerProtection } from "../../../src/protections/BlockInvitationsOnServerProtection";
import expect from "expect";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";
import { isOk, MatrixException, Ok } from "matrix-protection-suite";
import { MatrixError } from "matrix-bot-sdk";

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
    const takedownTargetUserID = StringUserID(await takedownTarget.getUserId());
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
        `!draupnir protections enable ${BlockInvitationsOnServerProtection.name}`
      )
    ).expect("Should be able to enable the protection");
    (
      await draupnir.sendTextCommand(
        moderatorUserID,
        `!draupnir takedown ${takedownTargetUserID} ${policyRoom} --no-confirm`
      )
    ).expect("Should be able to create the policy targetting the dodgy user");

    // We have to wait here for the policy to come down sync and for the internal
    // models to process and update it.
    // There doesn't seem to be a reliable way in concept to update the model.
    // where we could avoid doing this.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const invitationResult = await takedownTarget
      .inviteUser(moderatorUserID, takedownTargetRoomID)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
    if (isOk(invitationResult)) {
      throw new TypeError(
        "takendown users shouldn't be able to send invitations"
      );
    }
    // I'm pretty sure there are different versions of this being used in the code base
    // so instanceof fails :/ sucks balls mare
    // https://github.com/the-draupnir-project/Draupnir/issues/760
    // https://github.com/the-draupnir-project/Draupnir/issues/759
    if (invitationResult.error instanceof MatrixException) {
      expect(invitationResult.error.matrixErrorMessage).toBe(
        "You are not allowed to send invitations to this homeserver"
      );
      expect(invitationResult.error.matrixErrorCode).toBe("M_FORBIDDEN");
    } else {
      const matrixError = invitationResult.error.exception as MatrixError;
      expect(matrixError.error).toBe(
        "You are not allowed to send invitations to this homeserver"
      );
      expect(matrixError.errcode).toBe("M_FORBIDDEN");

      // now test that invitations can go through anyways
      await moderator.joinRoom(takedownTargetRoomID);
      await takedownTarget.setUserPowerLevel(
        moderatorUserID,
        takedownTargetRoomID,
        100
      );
      await moderator.inviteUser(draupnir.clientUserID, takedownTargetRoomID);
    }
  } as unknown as Mocha.AsyncFunc);
});
