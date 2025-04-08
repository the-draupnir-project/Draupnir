// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  isStringUserID,
  StringServerName,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  LiteralPolicyRule,
  Logger,
  PolicyListRevision,
  PolicyRuleMatchType,
  PolicyRuleType,
  Recommendation,
} from "matrix-protection-suite";
import { AccountRestriction, UserAuditLog } from "./UserAuditLog";
import {
  checkKnownTables,
  SqliteSchemaOptions,
} from "../../backingstore/better-sqlite3/SqliteSchema";
import { BetterSqliteStore } from "../../backingstore/better-sqlite3/BetterSqliteStore";
import { Database } from "better-sqlite3";
import { Ok, Result } from "@gnuxie/typescript-result";

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
    { sender, rule }: { sender: StringUserID; rule: LiteralPolicyRule | null }
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
            restriction_type
          ) VALUES (?, ?, ?, ?)
        `
          )
          .run([policyID, userID, sender, restrictionType]);
      })();
      return Ok(undefined);
    }, `Failed to suspend user ${userID}`);
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

  public async findUnrestrictedUsers(
    serverName: StringServerName,
    revision: PolicyListRevision
  ): Promise<Result<[StringUserID, LiteralPolicyRule][]>> {
    // something should really setup a revision issuer that only has
    // policies matching local users, and that way this would be less work on the CPU
    // probably not really an issue though.
    // grr that's probably the way to do it without any weird revisions i think sigh
    // yeah this should be offloaded somehwere cos it's a pita :/
    const relevantPolicies = [
      ...revision.allRulesOfType(PolicyRuleType.User, Recommendation.Ban),
      ...revision.allRulesOfType(PolicyRuleType.User, Recommendation.Takedown),
    ].filter(
      (policy) =>
        policy.matchType === PolicyRuleMatchType.Literal &&
        isStringUserID(policy.entity) &&
        userServerName(policy.entity) === serverName
    );
    throw new TypeError("Not gonna happen");
  }
}
