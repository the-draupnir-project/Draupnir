// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import Database from "better-sqlite3";
import { BetterSqliteOptions } from "../../../src/backingstore/better-sqlite3/BetterSqliteStore";
import { SqliteRoomAuditLog } from "../../../src/protections/RoomTakedown/SqliteRoomAuditLog";
import {
  describePolicyRule,
  LiteralPolicyRule,
  parsePolicyRule,
  PolicyRuleType,
  randomRoomID,
  Recommendation,
} from "matrix-protection-suite";
import expect from "expect";

describe("RoomAuditLog test", function () {
  const options = { path: ":memory:" } satisfies BetterSqliteOptions;
  const db = new Database(options.path);
  db.pragma("FOREIGN_KEYS = ON");
  const store = new SqliteRoomAuditLog(options, db);
  it("Test that it doesn't return null or something", async function () {
    expect(store.isRoomTakendown(randomRoomID([]).toRoomIDOrAlias())).toBe(
      false
    );
  });
  it("Can logged takendown rooms", async function () {
    const bannedRoom = randomRoomID([]);
    const policyRoom = randomRoomID([]);
    const ban = parsePolicyRule(
      describePolicyRule({
        room_id: policyRoom.toRoomIDOrAlias(),
        entity: bannedRoom.toRoomIDOrAlias(),
        reason: "spam",
        recommendation: Recommendation.Takedown,
        type: PolicyRuleType.Room,
      }) as never
    ).expect("Should bea ble to parse the policy rule.");
    (await store.takedownRoom(ban as LiteralPolicyRule)).expect(
      "Should be able to takedown a room"
    );
    expect(store.isRoomTakendown(bannedRoom.toRoomIDOrAlias())).toBe(true);
  });
});
