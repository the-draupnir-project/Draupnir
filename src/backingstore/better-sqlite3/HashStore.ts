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
  RoomHashRecord,
  HashedRoomDetails,
  SHA256RoomHashStore,
  Logger,
} from "matrix-protection-suite";
import {
  BetterSqliteOptions,
  BetterSqliteStore,
  makeBetterSqliteDB,
} from "./BetterSqliteStore";
import { enc, SHA256 } from "crypto-js";
import { Database } from "better-sqlite3";
import path from "path";
import { checkKnownTables, SqliteSchemaOptions } from "./SqliteSchema";

const log = new Logger("SqliteHashReversalStore");

const SchemaText = [
  `
  CREATE TABLE room_sha256 (
    room_id TEXT PRIMARY KEY NOT NULL,
    sha256 TEXT NOT NULL
  ) STRICT, WITHOUT ROWID;
  CREATE INDEX idx_sha256 ON room_sha256 (sha256, room_id);
  CREATE TABLE room_identification (
    room_id TEXT PRIMARY KEY NOT NULL,
    creator TEXT NOT NULL,
    server TEXT NOT NULL,
    FOREIGN KEY (room_id) REFERENCES room_sha256(room_id)
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
    return checkKnownTables(db, ["room_sha256", "room_identification"]);
  },
} satisfies SqliteSchemaOptions;

type RoomSha256 = {
  room_id: StringRoomID;
  sha256: string;
};

export class SqliteHashReversalStore
  extends BetterSqliteStore
  implements Omit<SHA256RoomHashStore, "on" | "off">
{
  constructor(options: BetterSqliteOptions, db: Database) {
    super(SchemaOptions, db, log);
  }

  public static createToplevel(storagePath: string): SqliteHashReversalStore {
    const options = {
      path: path.join(storagePath, "hash-store.db"),
      WALMode: true,
      foreignKeys: true,
      fileMustExist: false,
    };
    return new SqliteHashReversalStore(
      options,
      makeBetterSqliteDB(options, log)
    );
  }

  public async findRoomHash(
    hash: string
  ): Promise<Result<StringRoomID | undefined>> {
    try {
      return Ok(
        this.db
          .prepare(`SELECT room_id FROM room_sha256 WHERE sha256 = ?`)
          .pluck()
          .get(hash) as StringRoomID | undefined
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
    try {
      const statement = this.db.prepare(`
        SELECT room_id, sha256
        FROM room_sha256
        WHERE sha256 IN (SELECT value FROM json_each(?))`);
      return Ok(statement.all(JSON.stringify(sha256s)) as RoomSha256[]);
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
    const statement = this.db.prepare(`
      SELECT room_id, sha256
      FROM room_sha256
      WHERE room_id IN (SELECT value FROM json_each(?))`);
    return statement.all(JSON.stringify(roomIDs)) as RoomHashRecord[];
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

  public async storeRoomIdentification(
    roomDetails: HashedRoomDetails
  ): Promise<Result<void>> {
    try {
      const statement = this.db.prepare(
        `REPLACE INTO room_identification (room_id, creator, server)
        VALUES (?, ?, ?)`
      );
      statement.run([
        roomDetails.roomID,
        roomDetails.creator,
        roomDetails.server,
      ]);
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
