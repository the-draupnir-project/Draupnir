// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import Database from "better-sqlite3";
import { BetterSqliteOptions } from "../../../src/backingstore/better-sqlite3/BetterSqliteStore";
import { SqliteUserAuditLog } from "../../../src/protections/HomeserverUserPolicyApplication/SqliteUserAuditLog";
import {
  describePolicyRule,
  LiteralPolicyRule,
  parsePolicyRule,
  PolicyRuleType,
  randomRoomID,
  randomUserID,
  Recommendation,
} from "matrix-protection-suite";
import { SuspensionType } from "../../../src/protections/HomeserverUserPolicyApplication/UserAuditLog";
import expect from "expect";

describe("UserAuditLog test", function () {
  const options = { path: ":memory:" } satisfies BetterSqliteOptions;
  const db = new Database(options.path);
  db.pragma("FOREIGN_KEYS = ON");
  const store = new SqliteUserAuditLog(db);
  it("Can logged suspended users", async function () {
    const bannedUser = randomUserID();
    const policyRoom = randomRoomID([]);
    const moderator = randomUserID();
    expect(
      (await store.isUserSuspended(bannedUser)).expect(
        "Should be able to query if user is suspended"
      )
    ).toBe(false);
    const ban = parsePolicyRule(
      describePolicyRule({
        room_id: policyRoom.toRoomIDOrAlias(),
        entity: bannedUser,
        reason: "spam",
        recommendation: Recommendation.Ban,
        type: PolicyRuleType.User,
      }) as never
    ).expect("Should be able to parse the policy rule.");
    (
      await store.suspendUser(bannedUser, SuspensionType.Suspended, {
        sender: moderator,
        rule: ban as LiteralPolicyRule,
      })
    ).expect("Should be able to takedown a room");
    expect(
      (await store.isUserSuspended(bannedUser)).expect(
        "Should be able to query if user is suspended"
      )
    ).toBe(true);
    // now unsuspend them
    (await store.unsuspendUser(bannedUser, moderator)).expect(
      "Should be able to unsuspend a user"
    );
    expect(
      (await store.isUserSuspended(bannedUser)).expect(
        "Should be able to query if user is suspended"
      )
    ).toBe(false);
  });
  it("Can log suspended users even without a policy (when a command is used)", async function () {
    const bannedUser = randomUserID();
    const moderator = randomUserID();
    (
      await store.suspendUser(bannedUser, SuspensionType.Suspended, {
        sender: moderator,
        rule: null,
      })
    ).expect("To be able to do this");
    expect(
      (await store.isUserSuspended(bannedUser)).expect(
        "Should be able to query if user is suspended"
      )
    ).toBe(true);
  });
});
