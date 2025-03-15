// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import Database from "better-sqlite3";
import { SqliteHashReversalStore } from "../../../src/backingstore/better-sqlite3/HashStore";
import { BetterSqliteOptions } from "../../../src/backingstore/better-sqlite3/BetterSqliteStore";
import {
  describeStateEvent,
  HashedLiteralPolicyRule,
  parsePolicyRule,
  PolicyRuleMatchType,
  PolicyRuleType,
  randomRoomID,
  randomUserID,
  Recommendation,
} from "matrix-protection-suite";
import { SHA256, enc } from "crypto-js";
import expect from "expect";

function makeStore(): SqliteHashReversalStore {
  const options = { path: ":memory:" } satisfies BetterSqliteOptions;
  const db = new Database(options.path);
  db.pragma("FOREIGN_KEYS = ON");
  return new SqliteHashReversalStore(options, db);
}

describe("meow", function () {
  it("Doesn't return weird nulls if there is nothing in the database", async function () {
    const store = makeStore();
    const bannedRoom = randomRoomID([]);
    const policyRoom = randomRoomID([]);
    const bannedRoomHash = enc.Base64.stringify(
      SHA256(bannedRoom.toRoomIDOrAlias())
    );
    const findResult = (await store.findRoomHash(bannedRoomHash)).expect(
      "Should be able to at least query this"
    );
    expect(findResult).toBe(undefined);
    // now for finding reversed hashed room policies:
    const ban = parsePolicyRule(
      describeStateEvent({
        room_id: policyRoom.toRoomIDOrAlias(),
        content: {
          recommendation: Recommendation.Takedown,
          hashes: {
            sha256: bannedRoomHash,
          },
        },
        sender: randomUserID(),
        state_key: bannedRoomHash,
        type: PolicyRuleType.Room,
      }) as never
    ).expect("Should bea ble to parse the policy rule.");
    expect(ban.matchType).toBe(PolicyRuleMatchType.HashedLiteral);
    const reverserResult = (
      await store.reverseHashedRoomPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse policies that are unknown");
    expect(reverserResult.length).toBe(0);
    // now try storing the room and testing that the policy is there
    (await store.storeUndiscoveredRooms([bannedRoom.toRoomIDOrAlias()])).expect(
      "Should be able to discover rooms jsut fine"
    );
    const foundHash = (await store.findRoomHash(bannedRoomHash)).expect(
      "Should be able to findRoomHash"
    );
    expect(foundHash).toBe(bannedRoom.toRoomIDOrAlias());
    const reversedPolicies = (
      await store.reverseHashedRoomPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse meow");
    const reversedBan = reversedPolicies.at(0);
    if (reversedBan === undefined) {
      throw new TypeError("Reversed ban isn't here mare");
    }
    expect(reversedBan.entity).toBe(bannedRoom.toRoomIDOrAlias());
  });
});
