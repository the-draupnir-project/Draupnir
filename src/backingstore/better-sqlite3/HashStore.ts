// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  ActionException,
  ActionExceptionKind,
  HashedLiteralPolicyRule,
  LiteralPolicyRule,
  makeReversedHashedPolicy,
  RoomBasicDetails,
  RoomHashRecord,
  SHA256RoomHashStore,
} from "matrix-protection-suite";
import {
  BetterSqliteOptions,
  BetterSqliteStore,
  makeBetterSqliteDB,
} from "./BetterSqliteStore";
import { enc, SHA256 } from "crypto-js";
import { Database } from "better-sqlite3";
import path from "path";

// We will need some kind of audit database to store actions in against rooms

const schema = [
  `CREATE TABLE room_sha256 (
        room_id TEXT PRIMARY KEY NOT NULL,
        sha256 TEXT NOT NULL
  ) STRICT;`,
  `CREATE TABLE room_detail (
    room_id TEXT PRIMARY KEY NOT NULL,
    creator TEXT,
    name TEXT,
    topic TEXT,
    joined_members INTEGER
  ) STRICT;
`,
];

type RoomSha256 = {
  room_id: StringRoomID;
  sha256: string;
};

export class SqliteHashReversalStore
  extends BetterSqliteStore
  implements Omit<SHA256RoomHashStore, "on" | "off">
{
  constructor(options: BetterSqliteOptions, db: Database) {
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
  }

  public static createToplevel(storagePath: string): SqliteHashReversalStore {
    const options = {
      path: path.join(storagePath, "hash-store.db"),
      WALMode: true,
      foreignKeys: true,
      fileMustExist: false,
    };
    return new SqliteHashReversalStore(options, makeBetterSqliteDB(options));
  }

  public async findRoomHash(
    hash: string
  ): Promise<Result<StringRoomID | undefined>> {
    try {
      return Ok(
        (
          this.db
            .prepare(`SELECT room_id FROM room_sha256 WHERE sha256 = ?`)
            .get(hash) as RoomSha256 | null
        )?.room_id ?? undefined
      );
    } catch (e) {
      if (e instanceof Error) {
        return ActionException.Result(
          `Unexpected error while querying for a room hash`,
          {
            exception: e,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        );
      } else {
        throw e;
      }
    }
  }

  private async findMatchingRooms(
    policies: HashedLiteralPolicyRule[]
  ): Promise<Result<RoomSha256[]>> {
    const sha256s: string[] = [];
    for (const policy of policies) {
      if (policy.hashes["sha256"] !== undefined) {
        sha256s.push(policy.hashes["sha256"]);
      }
    }
    // This query looks sketch and I don't like it but we're just putting in question marks and nothing else
    // I can't believe there's not a builtin for this fml.
    try {
      const statement = this.db.prepare(
        `SELECT room_id, sha256 FROM room_sha256 WHERE sha256 IN (${sha256s.map(() => "?").join(",")})`
      );
      return Ok(statement.all(sha256s) as RoomSha256[]);
    } catch (exception) {
      if (exception instanceof Error) {
        return ActionException.Result(
          "Unexpected error while attempting to reverse hashed policies",
          {
            exception,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        );
      } else {
        throw exception;
      }
    }
  }

  public async reverseHashedRoomPolicies(
    policies: HashedLiteralPolicyRule[]
  ): Promise<Result<LiteralPolicyRule[]>> {
    const matches = await this.findMatchingRooms(policies);
    if (isError(matches)) {
      return matches;
    }
    const reversedPolicies: LiteralPolicyRule[] = [];
    for (const match of matches.ok) {
      const hashedLiteral = policies.find(
        (policy) => policy.hashes["sha256"] === match.sha256
      );
      if (hashedLiteral == undefined) {
        throw new TypeError(
          "Something has gone badly wrong we should be able to find the policy we entered"
        );
      }
      reversedPolicies.push(
        makeReversedHashedPolicy(match.room_id, hashedLiteral)
      );
    }
    return Ok(reversedPolicies);
  }

  private findExistingRooms(roomIDs: StringRoomID[]): RoomHashRecord[] {
    if (roomIDs.length === 0) {
      return [];
    }
    const placeholders = roomIDs.map(() => "?").join(", ");
    const statement = this.db.prepare(
      `SELECT room_id, sha256 FROM room_sha256 WHERE room_id IN (${placeholders})`
    );
    return statement.all(...roomIDs) as RoomHashRecord[];
  }

  public async storeUndiscoveredRooms(
    roomIDs: StringRoomID[]
  ): Promise<Result<RoomHashRecord[]>> {
    try {
      const existingRooms = this.findExistingRooms(roomIDs);
      const rowsToInsert: RoomHashRecord[] = [];
      for (const roomID of roomIDs) {
        if (!existingRooms.find((row) => row.room_id === roomID)) {
          rowsToInsert.push({
            room_id: roomID,
            sha256: enc.Base64.stringify(SHA256(roomID)),
          });
        }
      }

      if (rowsToInsert.length > 0) {
        const serializedRows = JSON.stringify(rowsToInsert);

        const statement = this.db.prepare(`
          REPLACE INTO room_sha256
          SELECT value ->> 'room_id', value ->> 'sha256'
          FROM json_each(?)
        `);

        statement.run(serializedRows);
      }
      return Ok(rowsToInsert);
    } catch (exception) {
      if (exception instanceof Error) {
        return ActionException.Result(
          `Error while trying to update known hashed rooms`,
          {
            exception,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        );
      } else {
        throw exception;
      }
    }
  }

  public async storeRoomDetails(
    roomDetails: RoomBasicDetails
  ): Promise<Result<void>> {
    try {
      const statement = this.db.prepare(`
        REPLACE INTO room_detail SELECT
        value ->> 'room_id',
        value ->> 'creator',
        value ->> 'name',
        value ->> 'topic',
        value ->> 'joined_members'
        FROM json_each(?)`);
      statement.run(JSON.stringify(roomDetails));
      return Ok(undefined);
    } catch (exception) {
      if (exception instanceof Error) {
        return ActionException.Result(
          `Error while trying to store details about a hashed room`,
          {
            exception,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        );
      } else {
        throw exception;
      }
    }
  }
}
