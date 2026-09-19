// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { newTestUser } from "./clientHelper";
import { Draupnir } from "../../src/Draupnir";
import { DraupnirTestContext } from "./mjolnirSetupUtils";
import {
  DEFAULT_EXPIRY_DEBOUNCE_MS,
  Membership,
  PolicyRuleType,
} from "@the-draupnir-project/matrix-protection-suite";
import {
  MatrixRoomReference,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

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

/**
 * Polls `predicate` until it's true, rather than a fixed sleep since sync
 * response times are too unpredictable for a fixed wait and we want the test
 * to compromise between latency and reliability.
 */
async function waitForCondition(
  predicate: () => boolean,
  { timeoutMS, intervalMS = 200 }: { timeoutMS: number; intervalMS?: number }
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMS) {
      throw new Error(`Timed out after ${timeoutMS}ms waiting for condition`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMS));
  }
}

// Expiry only drops the policy itself but instead triggers the policy removed code path.
describe("Policy expiry test (MSC3908)", function () {
  it(
    "An expiring ban policy is applied, then dropped from the policy list once it expires",
    async function (this: DraupnirTestContext) {
      this.timeout(90000);
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`setup didn't run properly`);
      }
      const spammer = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "expiring-spam" },
      });
      const spammerUserID = (await spammer.getUserId()) as StringUserID;
      const protectedRoomID = (await draupnir.client.createRoom({
        invite: [spammerUserID],
      })) as StringRoomID;
      await spammer.joinRoom(protectedRoomID);
      (
        await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
          MatrixRoomReference.fromRoomID(protectedRoomID)
        )
      ).expect("Should be able to protect the room");

      const policyRoomID = await createWatchedPolicyRoom(draupnir);
      const policyRoomEditor = (
        await draupnir.policyRoomManager.getPolicyRoomEditor(
          MatrixRoomReference.fromRoomID(policyRoomID)
        )
      ).expect("Should be able to get a policy room editor");

      const expiryDurationMS = 3000;
      const expiry = Date.now() + expiryDurationMS;
      (
        await policyRoomEditor.banEntity(
          PolicyRuleType.User,
          spammerUserID,
          "spam",
          { expiry }
        )
      ).expect("Should be able to create a ban policy with an expiry");

      const matchesEntity = () =>
        draupnir.protectedRoomsSet.watchedPolicyRooms.currentRevision.allRulesMatchingEntity(
          spammerUserID,
          { type: PolicyRuleType.User }
        ).length;
      const matchesMember = () =>
        draupnir.protectedRoomsSet.setPoliciesMatchingMembership.currentRevision.allRulesMatchingMember(
          spammerUserID,
          {}
        ).length;

      // wait for the policy to come down sync and be applied to the protected room.
      await waitForCondition(() => matchesEntity() === 1, {
        timeoutMS: 20000,
      });
      await waitForCondition(() => matchesMember() === 1, {
        timeoutMS: 20000,
      });
      await waitForCondition(
        () => {
          const membershipRevision =
            draupnir.protectedRoomsSet.setRoomMembership.getRevision(
              protectedRoomID
            );
          return (
            membershipRevision?.membershipForUser(spammerUserID)?.membership ===
            Membership.Ban
          );
        },
        { timeoutMS: 20000 }
      );

      // wait for the policy to expire: the remaining time until expiry, plus
      // the scheduler's coalescing debounce, plus a generous timeout for sync
      // and revision propagation against a possibly-busy shared homeserver.
      const remainingUntilExpiry = Math.max(0, expiry - Date.now());
      await waitForCondition(() => matchesEntity() === 0, {
        timeoutMS: remainingUntilExpiry + DEFAULT_EXPIRY_DEBOUNCE_MS + 20000,
      });
      await waitForCondition(() => matchesMember() === 0, {
        timeoutMS: 20000,
      });
    } as unknown as Mocha.AsyncFunc
  );
});
