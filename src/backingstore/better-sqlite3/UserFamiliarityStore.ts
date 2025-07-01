// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { Database } from "better-sqlite3";
import {
  EntityFamiliarity,
  UserFamiliarityStore,
  UserFamiliarityRecord,
  UserFamiliarityPromotionSpec,
  Logger,
} from "matrix-protection-suite";
import { BetterSqliteStore, flatTransaction } from "./BetterSqliteStore";
import {
  checkKnownTables,
  SqliteSchemaOptions,
  wrapInTryCatch,
} from "./SqliteSchema";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { isError, Ok, Result } from "@gnuxie/typescript-result";

const log = new Logger("UserFamiliarityStore");

const SchemaText = [
  `
  CREATE TABLE user_familiarity (
    user_id TEXT PRIMARY KEY NOT NULL,
    familiarity TEXT NOT NULL,
    attained_at INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE user_interaction_summary (
    user_id TEXT PRIMARY KEY NOT NULL,
    familiarity_at_observation TEXT NOT NULL,
    observed_interactions INTEGER NOT NULL,
    last_observed_interaction_at INTEGER NOT NULL
    FOREIGN KEY (user_id) REFERENCES user_familiarity(user_id)
  ) STRICT;
  `,
];

const SchemaOptions = {
  upgradeSteps: SchemaText.map(
    (text) =>
      function (db) {
        db.exec(text);
      }
  ),
  consistencyCheck(db) {
    return checkKnownTables(db, [
      "user_familiarity",
      "user_interaction_summary",
    ]);
  },
} satisfies SqliteSchemaOptions;

export class BetterSqliteUserFamiliarityStore implements UserFamiliarityStore {
  private readonly baseStore: BetterSqliteStore;
  public constructor(private readonly db: Database) {
    this.baseStore = new BetterSqliteStore(SchemaOptions, db, log);
  }
  public async findEntityFamiliarityRecord(
    userID: StringUserID
  ): Promise<Result<UserFamiliarityRecord>> {
    // FIXME: Do we need to make something up if we can't find
    //        a record or return undefined?
    return wrapInTryCatch(() => {
      return Ok(
        this.db
          .prepare(
            `
            SELECT
            uf.user_id as user_id,
            uf.familiarity as current_familiarity,
            uf.attained_at as attained_current_familiarity_at,
            uis.observed_interactions as observed_interactions_at_current_familiarity,
            uis.last_observed_interaction_at as last_observed_interaction_ts
            FROM user_familiarity uf
            INNER JOIN user_interaction_summary uis
            ON uis.user_id = uf.user_id;
            `
          )
          .pluck()
          .get(userID) as UserFamiliarityRecord
      );
    }, `Failed to fetch the familiarity record for the user ${userID}`);
  }
  public async observeInteractions(
    userIDs: StringUserID[]
  ): Promise<Result<void>> {
    return wrapInTryCatch(() => {
      const now = Date.now();

      const insertFamiliarity = this.db.prepare(`
        INSERT INTO user_familiarity (user_id, familiarity, attained_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO NOTHING
      `);

      const upsertInteractionSummary = this.db.prepare(`
        INSERT INTO user_interaction_summary (
          user_id, familiarity_at_observation, observed_interactions, last_observed_interaction_at
        )
        SELECT
          uf.user_id,
          uf.familiarity,
          1,
          ?
        FROM user_familiarity uf
        WHERE uf.user_id = ?
        ON CONFLICT(user_id) DO UPDATE SET
          observed_interactions = observed_interactions + 1,
          last_observed_interaction_at = excluded.last_observed_interaction_at,
          familiarity_at_observation = excluded.familiarity_at_observation
      `);

      const transaction = flatTransaction(
        this.db,
        (userIDs: StringUserID[]) => {
          for (const userID of userIDs) {
            insertFamiliarity.run(userID, EntityFamiliarity.Encountered, now);
            upsertInteractionSummary.run(now, userID);
          }
        }
      );
      transaction(userIDs);
      return Ok(undefined);
    }, "Unable to observe interactions from users");
  }
  // FIXME: this method should just promote entities
  //        that match the spec.
  public async findEntitiesElegiableForPromotion(
    spec: UserFamiliarityPromotionSpec
  ): Promise<Result<StringUserID[]>> {
    const now = Date.now();
    const minAttainedAt = now - spec.mandatory_presence_ms;
    return wrapInTryCatch(() => {
      return Ok(
        this.db
          .prepare(
            `
          SELECT user_id
          FROM user_interaction_summary
          WHERE familiarity_at_observation = ?
          AND attained_at <= ?
          AND observed_interactions >= ?
        `
          )
          .pluck()
          .all(
            spec.current_familiarity,
            minAttainedAt,
            spec.mandatory_number_of_interactions
          ) as StringUserID[]
      );
    }, "Unable to fetch entities elgiable for promotion");
  }
  public async promoteEntitiesElegiableForPromotion(
    spec: UserFamiliarityPromotionSpec
  ): Promise<Result<StringUserID[]>> {
    const eligibleUsersResult =
      await this.findEntitiesElegiableForPromotion(spec);
    if (isError(eligibleUsersResult)) {
      return eligibleUsersResult;
    }
    const now = Date.now();

    return wrapInTryCatch(() => {
      const updateFamiliarity = this.db.prepare(`
        UPDATE user_familiarity
        SET familiarity = ?, attained_at = ?
        WHERE user_id = ?
      `);

      const updateInteractionSummary = this.db.prepare(`
        UPDATE user_interaction_summary
        SET familiarity_at_observation = ?, observed_interactions = 0, last_observed_interaction_at = ?
        WHERE user_id = ?
      `);

      const transaction = this.db.transaction((userIDs: string[]) => {
        for (const user_id of userIDs) {
          updateFamiliarity.run(spec.next_familiarity, now, user_id);
          updateInteractionSummary.run(spec.next_familiarity, now, user_id);
        }
      });

      transaction(eligibleUsersResult.ok);
      return eligibleUsersResult;
    }, "Failed to promote entities elegiable for promotion");
  }
  public async forceFamiliarity(
    userID: StringUserID,
    nextFamiliarity: EntityFamiliarity
  ): Promise<Result<void>> {
    const now = Date.now();

    return wrapInTryCatch(() => {
      const forceFamiliarity = this.db.prepare(`
        UPDATE user_familiarity
        SET familiarity = ?, attained_at = ?
        WHERE user_id = ?
      `);
      const resetInteractionSummary = this.db.prepare(`
        UPDATE user_interaction_summary
        SET familiarity_at_observation = ?, observed_interactions = 0, last_observed_interaction_at = ?
        WHERE user_id = ?
      `);

      const transaction = this.db.transaction(() => {
        forceFamiliarity.run(nextFamiliarity, now, userID);
        resetInteractionSummary.run(nextFamiliarity, now, userID);
      });
      transaction();
      return Ok(undefined);
    }, `Failed to force familiarity of the user ${userID}`);
  }
  public async clearUserRecord(userID: StringUserID): Promise<Result<void>> {
    return wrapInTryCatch(() => {
      const deleteFamiliarity = this.db.prepare(`
        DELETE FROM user_familiarity
        WHERE user_id = ?
      `);
      const deleteInteractionSummary = this.db.prepare(`
        DELTE FROM user_interaction_summary
        WHERE user_id = ?
      `);
      this.db.transaction(() => {
        deleteFamiliarity.run(userID);
        deleteInteractionSummary.run(userID);
      });
      return Ok(undefined);
    }, `Failed to clear ${userID}'s record`);
  }

  public destroy(): void {
    this.baseStore.destroy();
  }
}
