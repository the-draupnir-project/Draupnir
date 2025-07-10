// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import Database from "better-sqlite3";
import { BetterSqliteOptions } from "../../../src/backingstore/better-sqlite3/BetterSqliteStore";
import { BetterSqliteUserFamiliarityStore } from "../../../src/backingstore/better-sqlite3/UserFamiliarityStore";
import { EntityFamiliarity, randomUserID } from "matrix-protection-suite";
import expect from "expect";

describe("RoomAuditLog test", function () {
  const options = { path: ":memory:" } satisfies BetterSqliteOptions;
  const db = new Database(options.path);
  db.pragma("FOREIGN_KEYS = ON");
  const store = new BetterSqliteUserFamiliarityStore(db);
  const newUser = randomUserID();
  it("Can observe interactions from users", async function () {
    const testStart = Date.now();
    (await store.observeInteractions([newUser])).expect(
      "Should be able to observe interactions"
    );
    const findResult = (
      await store.findEntityFamiliarityRecord(newUser)
    ).expect("Should be able to find the user");
    expect(findResult?.user_id).toBe(newUser);
    expect(findResult?.attained_current_familiarity_at).toBeGreaterThanOrEqual(
      testStart
    );
    expect(findResult?.current_familiarity).toBe(EntityFamiliarity.Encountered);
    expect(findResult?.last_observed_interaction_ts).toBeGreaterThanOrEqual(
      testStart
    );
    const eligiablePromotion = (
      await store.findEntitiesElegiableForPromotion({
        current_familiarity: EntityFamiliarity.Encountered,
        next_familiarity: EntityFamiliarity.Acknowledged,
        mandatory_number_of_interactions: 1,
        mandatory_presence_ms: 1,
        maximum_number_of_infractions: 0,
      })
    ).expect("Should be able to find that the user is eligiable for promotion");
    expect(eligiablePromotion.length).toBe(1);
    expect(eligiablePromotion.at(0)).toBe(newUser);
    const promotedUsers = (
      await store.promoteEntitiesElegiableForPromotion({
        current_familiarity: EntityFamiliarity.Encountered,
        next_familiarity: EntityFamiliarity.Acknowledged,
        mandatory_number_of_interactions: 1,
        mandatory_presence_ms: 1,
        maximum_number_of_infractions: 0,
      })
    ).expect("Should be able to promote users");
    expect(promotedUsers.at(0)).toBe(newUser);
    // now test forcing familiarity
    (await store.forceFamiliarity(newUser, EntityFamiliarity.Essential)).expect(
      "Should be able to force the familiarity of users"
    );
    // now test clearing their record.
    (await store.clearUserRecord(newUser)).expect(
      "Should be able to clear their record"
    );
    // test that we can't promote users who haven't reached minimum interaction
    (await store.observeInteractions([newUser])).expect(
      "Should be able to observe interactions again"
    );
    const usersWithoutInteraction = (
      await store.findEntitiesElegiableForPromotion({
        current_familiarity: EntityFamiliarity.Encountered,
        next_familiarity: EntityFamiliarity.Acknowledged,
        mandatory_number_of_interactions: 10,
        mandatory_presence_ms: 1,
        maximum_number_of_infractions: 0,
      })
    ).expect("Should be able to find users without interaction");
    expect(usersWithoutInteraction.length).toBe(0);
    // and minimum time so that both conditions get tested.
    const usersWithoutMinimumPresence = (
      await store.findEntitiesElegiableForPromotion({
        current_familiarity: EntityFamiliarity.Encountered,
        next_familiarity: EntityFamiliarity.Acknowledged,
        mandatory_number_of_interactions: 0,
        mandatory_presence_ms: 1,
        maximum_number_of_infractions: 0,
      })
    ).expect("Should be able to find users without interaction");
    expect(usersWithoutMinimumPresence.length).toBe(0);
  });
});
