// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result } from "@gnuxie/typescript-result";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { RoomAuditLog } from "./RoomAuditLog";
import {
  ActionException,
  ActionExceptionKind,
  LiteralPolicyRule,
  PolicyRuleType,
} from "matrix-protection-suite";
import {
  BetterSqliteOptions,
  BetterSqliteStore,
  makeBetterSqliteDB,
} from "../../backingstore/better-sqlite3/BetterSqliteStore";
import { Database } from "better-sqlite3";
import path from "path";

// NOTE: This should only be used to check in bulk whether rooms are taken down
//       upon getting a policy, you probably always want to try again or
//       check with the server rather than check the audit log.
//       Incase rooms were unbanned.

const schema = [
  `CREATE TABLE policy_info (
        policy_id TEXT PRIMARY KEY NOT NULL,
        sender_user_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        type TEXT NOT NULL,
        recommendation TEXT NOT NULL,
    ) STRICT;`,
  `CREATE TABLE room_takedown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id TEXT NOT NULL,
    target_room_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (policy_id) REFERENCES policy_info(policy_id)
  ) STRICT;`,
];

export type RoomTakedown = {
  id: number;
  policy_id: string;
  target_room_id: StringRoomID;
  created_at: number;
};

export class SqliteRoomAuditLog
  extends BetterSqliteStore
  implements RoomAuditLog
{
  private readonly takedownRooms: Set<StringRoomID>;
  public constructor(options: BetterSqliteOptions, db: Database) {
    super(
      schema.map(
        (text) =>
          function (db) {
            db.prepare(text).run();
          }
      ),
      options,
      db
    );
    this.ensureSchema();
    this.takedownRooms = new Set(this.loadTakendownRooms());
  }

  public static createToplevel(storagePath: string): SqliteRoomAuditLog {
    const options = {
      path: path.join(storagePath, "room-audit-log.db"),
      WALMode: true,
      foreignKeys: true,
      fileMustExist: false,
    };
    return new SqliteRoomAuditLog(options, makeBetterSqliteDB(options));
  }

  public async takedownRoom(policy: LiteralPolicyRule): Promise<Result<void>> {
    if (policy.kind !== PolicyRuleType.Room) {
      throw new TypeError(
        "You can only use takedownRoom on room policies what are you doing?"
      );
    }
    try {
      const policyInfoStatement = this.db.prepare(
        `REPLACE INTO policy_info (policy_id, sender_user_id, room_id, state_key, type, recommendation)
        VALUES (?, ?, ?, ?, ?, ?)`
      );
      const takedownStatement = this.db.prepare(`
        INSERT INTO room_takedown (policy_id, target_room_id) VALUES (?, ?)`);
      this.db.transaction(() => {
        policyInfoStatement.run([
          policy.sourceEvent.event_id,
          policy.sourceEvent.sender,
          policy.sourceEvent.room_id,
          policy.sourceEvent.state_key,
          policy.sourceEvent.type,
          policy.recommendation,
        ]);
        takedownStatement.run([policy.sourceEvent.event_id, policy.entity]);
      })();
      this.takedownRooms.add(policy.entity as StringRoomID);
      return Ok(undefined);
    } catch (exception) {
      if (exception instanceof Error) {
        return ActionException.Result("Unable to log takedown", {
          exception,
          exceptionKind: ActionExceptionKind.Unknown,
        });
      } else {
        throw exception;
      }
    }
  }

  private loadTakendownRooms(): StringRoomID[] {
    return this.db
      .prepare(`SELECT room_id FROM room_takedown`)
      .all() as StringRoomID[];
  }
  isRoomTakendown(roomID: StringRoomID): boolean {
    return this.takedownRooms.has(roomID);
  }
}
