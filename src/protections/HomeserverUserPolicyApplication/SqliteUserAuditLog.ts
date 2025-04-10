// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  LiteralPolicyRule,
  Logger,
} from "matrix-protection-suite";
import { UserAuditLog } from "./UserAuditLog";
import {
  checkKnownTables,
  SqliteSchemaOptions,
} from "../../backingstore/better-sqlite3/SqliteSchema";
import {
  BetterSqliteStore,
  makeBetterSqliteDB,
} from "../../backingstore/better-sqlite3/BetterSqliteStore";
import { Database } from "better-sqlite3";
import { Ok, Result } from "@gnuxie/typescript-result";
import { AccountRestriction } from "matrix-protection-suite-for-matrix-bot-sdk";
import path from "path";

const log = new Logger("SqliteUserAuditLog");

const SchemaText = [
  `
  CREATE TABLE policy_info (
    policy_id TEXT PRIMARY KEY NOT NULL,
    sender_user_id TEXT NOT NULL,
    entity TEXT NOT NULL,
    policy_room_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    type TEXT NOT NULL,
    recommendation TEXT NOT NULL
  ) STRICT;
  CREATE TABLE user_restriction (
    policy_id TEXT,
    target_user_id TEXT NOT NULL,
    sender_user_id TEXT NOT NULL,
    restriction_type TEXT NOT NULL,
    is_existing_restriction INTEGER NOT NULL CHECK (is_existing_restriction IN (0, 1)),
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (policy_id) REFERENCES policy_info(policy_id)
  ) STRICT;
  CREATE TABLE user_unrestriction (
    target_user_id TEXT NOT NULL,
    sender_user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    ) STRICT;`,
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
      "policy_info",
      "user_restriction",
      "user_unrestriction",
    ]);
  },
} satisfies SqliteSchemaOptions;

function wrapInTryCatch<T>(cb: () => Result<T>, message: string): Result<T> {
  try {
    return cb();
  } catch (e) {
    if (e instanceof Error) {
      return ActionException.Result(message, {
        exception: e,
        exceptionKind: ActionExceptionKind.Unknown,
      });
    } else {
      throw e;
    }
  }
}

export class SqliteUserAuditLog
  extends BetterSqliteStore
  implements UserAuditLog
{
  constructor(db: Database) {
    super(SchemaOptions, db, log);
  }

  public static readonly StoreName = "user-audit-log.db";
  public static createToplevel(storagePath: string): SqliteUserAuditLog {
    const options = {
      path: path.join(storagePath, SqliteUserAuditLog.StoreName),
      WALMode: true,
      foreignKeys: true,
      fileMustExist: false,
    };
    return new SqliteUserAuditLog(makeBetterSqliteDB(options, log));
  }

  public async isUserRestricted(
    userID: StringUserID
  ): Promise<Result<boolean>> {
    return wrapInTryCatch(
      () =>
        Ok(
          // This query is a bit long winded but it works i guess.
          (this.db
            .prepare(
              `
              SELECT
                CASE
                  WHEN NOT EXISTS (SELECT 1 FROM user_restriction WHERE target_user_id = :user_id) THEN FALSE
                  WHEN MAX(user_unrestriction.created_at) >= MAX(user_restriction.created_at) THEN FALSE
                  ELSE TRUE
                END AS is_suspended
              FROM user_restriction
              LEFT JOIN user_unrestriction
                ON user_restriction.target_user_id = user_unrestriction.target_user_id
              WHERE user_restriction.target_user_id = :user_id;`
            )
            .pluck()
            .get({ user_id: userID }) as number) === 1
        ),
      `Failed to check if user ${userID} is suspended`
    );
  }
  private insertPolicyInfo(policy: LiteralPolicyRule): void {
    this.db
      .prepare(
        `REPLACE INTO policy_info (policy_id, sender_user_id, policy_room_id, entity, state_key, type, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run([
        policy.sourceEvent.event_id,
        policy.sourceEvent.sender,
        policy.sourceEvent.room_id,
        policy.entity,
        policy.sourceEvent.state_key,
        policy.sourceEvent.type,
        policy.recommendation,
      ]);
  }
  public async recordUserRestriction(
    userID: StringUserID,
    restrictionType: AccountRestriction,
    {
      sender,
      rule,
      isExistingRestriction,
    }: {
      sender: StringUserID;
      rule: LiteralPolicyRule | null;
      isExistingRestriction?: boolean | undefined;
    }
  ): Promise<ActionResult<void>> {
    return wrapInTryCatch(() => {
      this.db.transaction(() => {
        if (rule) {
          this.insertPolicyInfo(rule);
        }
        const policyID = rule?.sourceEvent.event_id ?? null;
        this.db
          .prepare(
            `
          INSERT INTO user_restriction (
            policy_id,
            target_user_id,
            sender_user_id,
            restriction_type,
            is_existing_restriction
          ) VALUES (?, ?, ?, ?, ?)
        `
          )
          .run([
            policyID,
            userID,
            sender,
            restrictionType,
            Number(Boolean(isExistingRestriction)),
          ]);
      })();
      return Ok(undefined);
    }, `Failed to suspend user ${userID}`);
  }
  public async recordExistingUserRestriction(
    userID: StringUserID,
    restriction: AccountRestriction
  ): Promise<Result<void>> {
    return await this.recordUserRestriction(userID, restriction, {
      sender: userID,
      rule: null,
      isExistingRestriction: true,
    });
  }
  public async unrestrictUser(
    userID: StringUserID,
    sender: StringUserID
  ): Promise<ActionResult<void>> {
    return wrapInTryCatch(() => {
      this.db
        .prepare(
          `
          INSERT INTO user_unrestriction (target_user_id, sender_user_id) VALUES (?, ?)
          `
        )
        .run([userID, sender]);
      return Ok(undefined);
    }, `Failed to unsuspend user ${userID}`);
  }
}
