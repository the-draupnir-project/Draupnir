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
import {
  StringRoomID,
  StringServerName,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { createHash } from "crypto";

function makeStore(): SqliteHashReversalStore {
  const options = { path: ":memory:" } satisfies BetterSqliteOptions;
  const db = new Database(options.path);
  db.pragma("FOREIGN_KEYS = ON");
  return new SqliteHashReversalStore(db);
}

function base64sha256(entity: string): string {
  return createHash("sha256").update(entity, "utf8").digest("base64");
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
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse policies that are unknown");
    expect(reverserResult.length).toBe(0);
    // now try storing the room and testing that the policy is there
    (await store.storeUndiscoveredRooms([bannedRoom.toRoomIDOrAlias()])).expect(
      "Should be able to discover rooms just fine"
    );
    const foundHash = (await store.findRoomHash(bannedRoomHash)).expect(
      "Should be able to findRoomHash"
    );
    expect(foundHash).toBe(bannedRoom.toRoomIDOrAlias());
    const reversedPolicies = (
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse meow");
    const reversedBan = reversedPolicies.at(0);
    if (reversedBan === undefined) {
      throw new TypeError("Reversed ban isn't here mare");
    }
    expect(reversedBan.entity).toBe(bannedRoom.toRoomIDOrAlias());
  });
  it("Can discover servers from stored rooms", async function () {
    const store = makeStore();
    const bannedServer = StringServerName("banned.example.com");
    const roomBannedViaServer = StringRoomID("!banned:banned.example.com");
    const policyRoom = randomRoomID([]);
    const bannedServerHash = base64sha256(bannedServer);
    const findResult = (await store.findServerHash(bannedServerHash)).expect(
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
            sha256: bannedServerHash,
          },
        },
        sender: randomUserID(),
        state_key: bannedServerHash,
        type: PolicyRuleType.Server,
      }) as never
    ).expect("Should bea ble to parse the policy rule.");
    expect(ban.matchType).toBe(PolicyRuleMatchType.HashedLiteral);
    const reverserResult = (
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse policies that are unknown");
    expect(reverserResult.length).toBe(0);
    // now try storing the room and testing that the policy is there
    (await store.storeUndiscoveredRooms([roomBannedViaServer])).expect(
      "Should be able to discover rooms just fine"
    );
    const foundHash = (await store.findServerHash(bannedServerHash)).expect(
      "Should be able to now find the server hash from the room we discovered"
    );
    expect(foundHash).toBe(bannedServer);
    const reversedPolicies = (
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse meow");
    const reversedBan = reversedPolicies.at(0);
    if (reversedBan === undefined) {
      throw new TypeError("Reversed ban isn't here mare");
    }
    expect(reversedBan.entity).toBe(bannedServer);
  });
  it("Can reverse user policies", async function () {
    const store = makeStore();
    const bannedUser = StringUserID("@banned:banned.example.com");
    const policyRoom = randomRoomID([]);
    const bannedUserHash = base64sha256(bannedUser);
    const findResult = (await store.findUserHash(bannedUserHash)).expect(
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
            sha256: bannedUserHash,
          },
        },
        sender: randomUserID(),
        state_key: bannedUserHash,
        type: PolicyRuleType.User,
      }) as never
    ).expect("Should bea ble to parse the policy rule.");
    expect(ban.matchType).toBe(PolicyRuleMatchType.HashedLiteral);
    const reverserResult = (
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse policies that are unknown");
    expect(reverserResult.length).toBe(0);
    // now try storing the room and testing that the policy is there
    (await store.storeUndiscoveredUsers([bannedUser])).expect(
      "Should be able to discover banned users just fine"
    );
    const foundHash = (await store.findUserHash(bannedUserHash)).expect(
      "Should be able to now find the server hash from the room we discovered"
    );
    expect(foundHash).toBe(bannedUser);
    const reversedPolicies = (
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse meow");
    const reversedBan = reversedPolicies.at(0);
    if (reversedBan === undefined) {
      throw new TypeError("Reversed ban isn't here mare");
    }
    expect(reversedBan.entity).toBe(bannedUser);
  });
  it("Can discover servers from stored users", async function () {
    const store = makeStore();
    const bannedServer = StringServerName("banned.example.com");
    const bannedUser = StringUserID("@banned:banned.example.com");
    const policyRoom = randomRoomID([]);
    const bannedServerHash = base64sha256(bannedServer);
    const findResult = (await store.findServerHash(bannedServerHash)).expect(
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
            sha256: bannedServerHash,
          },
        },
        sender: randomUserID(),
        state_key: bannedServerHash,
        type: PolicyRuleType.Server,
      }) as never
    ).expect("Should bea ble to parse the policy rule.");
    expect(ban.matchType).toBe(PolicyRuleMatchType.HashedLiteral);
    const reverserResult = (
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse policies that are unknown");
    expect(reverserResult.length).toBe(0);
    // now try storing the room and testing that the policy is there
    (await store.storeUndiscoveredUsers([bannedUser])).expect(
      "Should be able to discover banned users just fine"
    );
    const foundHash = (await store.findServerHash(bannedServerHash)).expect(
      "Should be able to now find the server hash from the room we discovered"
    );
    expect(foundHash).toBe(bannedServer);
    const reversedPolicies = (
      await store.reverseHashedPolicies([ban as HashedLiteralPolicyRule])
    ).expect("Should be able to reverse meow");
    const reversedBan = reversedPolicies.at(0);
    if (reversedBan === undefined) {
      throw new TypeError("Reversed ban isn't here mare");
    }
    expect(reversedBan.entity).toBe(bannedServer);
  });
});
