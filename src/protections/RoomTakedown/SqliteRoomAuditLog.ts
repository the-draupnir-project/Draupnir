// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result } from "@gnuxie/typescript-result";
import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomAuditLog, RoomTakedownDetails } from "./RoomAuditLog";
import {
  ActionException,
  ActionExceptionKind,
  LiteralPolicyRule,
  PolicyRuleType,
  RoomBasicDetails,
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

// FIXME: The entity should really be included in the policy info mare...
//        This will be important when the rule targets users and servers and
//        not just rooms.

const schema = [
  `CREATE TABLE policy_info (
        policy_id TEXT PRIMARY KEY NOT NULL,
        sender_user_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        type TEXT NOT NULL,
        recommendation TEXT NOT NULL
    ) STRICT;`,
  `CREATE TABLE room_takedown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id TEXT NOT NULL,
    target_room_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (policy_id) REFERENCES policy_info(policy_id)
  ) STRICT;`,
  `CREATE TABLE room_detail_at_takedown (
    takedown_id INTEGER NOT NULL,
    room_id TEXT NOT NULL,
    creator TEXT,
    name TEXT,
    topic TEXT,
    joined_members INTEGER,
    FOREIGN KEY (takedown_id) REFERENCES room_takedown(id),
    PRIMARY KEY (takedown_id, room_id)
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

  public async takedownRoom(
    policy: LiteralPolicyRule,
    details: RoomBasicDetails
  ): Promise<Result<void>> {
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
      const detailStatement = this.db.prepare(`
      INSERT INTO room_detail_at_takedown (takedown_id, room_id, creator, name, topic, joined_members)
      VALUES (?, ?, ?, ?, ?, ?)`);
      this.db.transaction(() => {
        policyInfoStatement.run([
          policy.sourceEvent.event_id,
          policy.sourceEvent.sender,
          policy.sourceEvent.room_id,
          policy.sourceEvent.state_key,
          policy.sourceEvent.type,
          policy.recommendation,
        ]);
        const takedownRow = takedownStatement.run([
          policy.sourceEvent.event_id,
          policy.entity,
        ]);
        detailStatement.run([
          takedownRow.lastInsertRowid,
          details.room_id,
          details.creator ?? null,
          details.name ?? null,
          details.topic ?? null,
          details.joined_members ?? null,
        ]);
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

  public async getTakedownDetails(
    roomID: StringRoomID
  ): Promise<Result<RoomTakedownDetails | undefined>> {
    try {
      const query = this.db.prepare(`
        SELECT
        room_takedown.policy_id,
        room_takedown.created_at,
        room_detail_at_takedown.room_id,
        room_detail_at_takedown.creator,
        room_detail_at_takedown.name,
        room_detail_at_takedown.topic,
        room_detail_at_takedown.joined_members
        FROM room_takedown
        JOIN room_detail_at_takedown ON room_takedown.id = room_detail_at_takedown.takedown_id
        WHERE room_takedown.target_room_id = ?
        ORDER BY room_takedown.created_at DESC
        LIMIT 1
      `);
      type RowType = {
        policy_id: StringEventID;
        created_at: number;
        room_id: StringEventID;
      } & RoomTakedownDetails;
      const row = query.get(roomID) as RowType | undefined;
      if (row === undefined) {
        return Ok(undefined);
      }
      return Ok({
        policy_id: row.policy_id,
        created_at: row.created_at,
        room_id: row.room_id,
        creator: row.creator ?? undefined,
        name: row.name ?? undefined,
        topic: row.topic ?? undefined,
        joined_members: row.joined_members ?? undefined,
      });
    } catch (exception) {
      if (exception instanceof Error) {
        return ActionException.Result("Unable to fetch takedown details", {
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
      .prepare(`SELECT target_room_id FROM room_takedown`)
      .all() as StringRoomID[];
  }
  isRoomTakendown(roomID: StringRoomID): boolean {
    return this.takedownRooms.has(roomID);
  }
}
