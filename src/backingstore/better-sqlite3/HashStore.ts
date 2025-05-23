// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  roomIDServerName,
  StringRoomID,
  StringServerName,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ActionException,
  ActionExceptionKind,
  HashedLiteralPolicyRule,
  LiteralPolicyRule,
  makeReversedHashedPolicy,
  RoomHashRecord,
  HashedRoomDetails,
  SHA256HashStore,
  Logger,
  UserHashRecord,
  PolicyRuleType,
} from "matrix-protection-suite";
import { BetterSqliteStore, makeBetterSqliteDB } from "./BetterSqliteStore";
import { Database, Statement } from "better-sqlite3";
import path from "path";
import { checkKnownTables, SqliteSchemaOptions } from "./SqliteSchema";
import EventEmitter from "events";
import { createHash } from "crypto";

const log = new Logger("SqliteHashReversalStore");

// The reason why room is split into room_identification is because the creator
// is usually not readily available when discovering rooms from the anti-spam apis.
const SchemaText = [
  `
  CREATE TABLE room_sha256 (
    room_id TEXT PRIMARY KEY NOT NULL,
    sha256 TEXT NOT NULL
  ) STRICT, WITHOUT ROWID;
  CREATE INDEX idx_room_sha256 ON room_sha256 (sha256, room_id);
  CREATE TABLE room_identification (
    room_id TEXT PRIMARY KEY NOT NULL,
    creator TEXT NOT NULL,
    server TEXT NOT NULL,
    FOREIGN KEY (room_id) REFERENCES room_sha256(room_id)
  ) STRICT;
  CREATE TABLE user_sha256 (
    user_id TEXT PRIMARY KEY NOT NULL,
    server_name TEXT NOT NULL,
    sha256 TEXT NOT NULL
  ) STRICT, WITHOUT ROWID;
  CREATE INDEX idx_user_sha256 ON user_sha256 (sha256, user_id);
  CREATE TABLE server_sha256 (
    server_name TEXT PRIMARY KEY NOT NULL,
    sha256 TEXT NOT NULL
  ) STRICT, WITHOUT ROWID;
  CREATE INDEX idx_server_sha256 ON server_sha256 (sha256, server_name);
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
      "room_sha256",
      "room_identification",
      "user_sha256",
      "server_sha256",
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

export class SqliteHashReversalStore
  extends EventEmitter
  implements SHA256HashStore
{
  private readonly baseStore: BetterSqliteStore;
  constructor(private readonly db: Database) {
    super();
    this.baseStore = new BetterSqliteStore(SchemaOptions, db, log);
  }
  public async findUserHash(
    hash: string
  ): Promise<Result<StringUserID | undefined>> {
    return wrapInTryCatch(
      () =>
        Ok(
          this.db
            .prepare(`SELECT user_id FROM user_sha256 WHERE sha256 = ?`)
            .pluck()
            .get(hash) as StringUserID | undefined
        ),
      "error while querying hash for a user"
    );
  }
  public async findServerHash(
    hash: string
  ): Promise<Result<string | undefined>> {
    return wrapInTryCatch(
      () =>
        Ok(
          this.db
            .prepare(`SELECT server_name FROM server_sha256 WHERE sha256 = ?`)
            .pluck()
            .get(hash) as string | undefined
        ),
      "error while querying hash for a server name"
    );
  }

  public static readonly StoreName = "hash-store.db";
  public static createToplevel(storagePath: string): SqliteHashReversalStore {
    const options = {
      path: path.join(storagePath, SqliteHashReversalStore.StoreName),
      WALMode: true,
      foreignKeys: true,
      fileMustExist: false,
    };
    return new SqliteHashReversalStore(makeBetterSqliteDB(options, log));
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

  private reversePolicies(
    policies: HashedLiteralPolicyRule[],
    selectEntityFromSha256: Statement
  ): LiteralPolicyRule[] {
    const reversedPolicies: LiteralPolicyRule[] = [];
    for (const policy of policies) {
      const sha256 = policy.hashes["sha256"];
      if (sha256 === undefined) {
        continue;
      }
      const entity = selectEntityFromSha256.get(sha256) as string | undefined;
      if (entity === undefined) {
        continue;
      }
      reversedPolicies.push(makeReversedHashedPolicy(entity, policy));
    }
    return reversedPolicies;
  }

  private reverseRoomPolicies(
    policies: HashedLiteralPolicyRule[]
  ): LiteralPolicyRule[] {
    return this.reversePolicies(
      policies,
      this.db
        .prepare(
          `
          SELECT room_id
          FROM room_sha256
          WHERE sha256 = ?`
        )
        .pluck()
    );
  }

  private reverseUserPolicies(
    policies: HashedLiteralPolicyRule[]
  ): LiteralPolicyRule[] {
    return this.reversePolicies(
      policies,
      this.db
        .prepare(
          `
          SELECT user_id
          FROM user_sha256
          WHERE sha256 = ?`
        )
        .pluck()
    );
  }

  private reverseServerPolicies(
    policies: HashedLiteralPolicyRule[]
  ): LiteralPolicyRule[] {
    return this.reversePolicies(
      policies,
      this.db
        .prepare(
          `
          SELECT server_name
          FROM server_sha256
          WHERE sha256 = ?`
        )
        .pluck()
    );
  }

  public async reverseHashedPolicies(
    policies: HashedLiteralPolicyRule[]
  ): Promise<Result<LiteralPolicyRule[]>> {
    const hashedRoomPolicies = policies.filter(
      (policy) => policy.kind === PolicyRuleType.Room
    );
    const hashedUserPolicies = policies.filter(
      (policy) => policy.kind === PolicyRuleType.User
    );
    const hashedServerPolicies = policies.filter(
      (policy) => policy.kind === PolicyRuleType.Server
    );
    return wrapInTryCatch(() => {
      return Ok([
        ...this.reverseRoomPolicies(hashedRoomPolicies),
        ...this.reverseUserPolicies(hashedUserPolicies),
        ...this.reverseServerPolicies(hashedServerPolicies),
      ]);
    }, "Error trying to reverse hashed policies");
  }

  private storeUndiscoveredEntities<Record>(
    entities: string[],
    filterStatement: Statement,
    insertOrIgnore: Statement,
    recordFactoryFn: (entity: string, hash: string) => Record,
    eventEmitFn: (newRecords: Record[]) => void,
    serverExtractFn?: (record: Record) => StringServerName
  ): Result<Record[]> {
    return wrapInTryCatch(() => {
      const undiscoveredEntities = entities.filter((entity) =>
        filterStatement.get(entity)
      );
      const rowsToInsert: Record[] = undiscoveredEntities.map((entity) =>
        recordFactoryFn(
          entity,
          createHash("sha256").update(entity, "utf8").digest("base64")
        )
      );
      insertOrIgnore.run(JSON.stringify(rowsToInsert));
      // try to discover servers too while we're here
      if (serverExtractFn) {
        const storeResult = this.storeUndiscoveredEntities(
          rowsToInsert.map(serverExtractFn),
          this.db
            .prepare(
              `SELECT NOT EXISTS (SELECT 1 FROM server_sha256 where server_name = ?)`
            )
            .pluck(),
          this.db.prepare(`
            INSERT OR IGNORE INTO server_sha256 (server_name, sha256)
            SELECT value ->> 'server_name', value ->> 'sha256'
            FROM json_each(?)`),
          (server_name: StringServerName, sha256) => ({ server_name, sha256 }),
          (serverRecords) => {
            this.emit("ReversedHashes", [], [], serverRecords);
          }
        );
        if (isError(storeResult)) {
          return storeResult.elaborate("Failed to update discovered servers");
        }
      }
      eventEmitFn(rowsToInsert);
      return Ok(rowsToInsert);
    }, "Failed to insert undiscovered entities into hash store");
  }

  public async storeUndiscoveredRooms(
    roomIDs: StringRoomID[]
  ): Promise<Result<RoomHashRecord[]>> {
    return this.storeUndiscoveredEntities(
      roomIDs,
      this.db
        .prepare(
          `SELECT NOT EXISTS (SELECT 1 FROM room_sha256 where room_id = ?)`
        )
        .pluck(),
      this.db.prepare(`
        INSERT OR IGNORE INTO room_sha256 (room_id, sha256)
        SELECT value ->> 'room_id', value ->> 'sha256'
        FROM json_each(?)`),
      (room_id: StringRoomID, sha256) => ({ room_id, sha256 }),
      (roomRecords) => {
        this.emit("ReversedHashes", roomRecords, [], []);
      },
      (roomRecord) => roomIDServerName(roomRecord.room_id)
    );
  }

  public async storeUndiscoveredUsers(
    userIDs: StringUserID[]
  ): Promise<Result<UserHashRecord[]>> {
    return this.storeUndiscoveredEntities(
      userIDs,
      this.db
        .prepare(
          `SELECT NOT EXISTS (SELECT 1 FROM user_sha256 WHERE user_id = ?)`
        )
        .pluck(),
      this.db.prepare(`
        INSERT OR IGNORE INTO user_sha256 (user_id, server_name, sha256)
        SELECT value ->> 'user_id', value ->> 'server_name', value ->> 'sha256'
        FROM json_each(?)`),
      (user_id: StringUserID, sha256) => ({
        user_id,
        server_name: userServerName(user_id),
        sha256,
      }),
      (userRecords) => {
        this.emit("ReversedHashes", [], userRecords, []);
      },
      (userRecord) => userRecord.server_name
    );
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

  public async findRoomsByServer(
    server: StringServerName
  ): Promise<Result<StringRoomID[]>> {
    return wrapInTryCatch(
      () =>
        Ok(
          this.db
            .prepare(
              `
              SELECT room_id FROM room_identification WHERE server = ?`
            )
            .pluck()
            .all(server) as StringRoomID[]
        ),
      "Error while trying to find rooms created by server"
    );
  }

  public async findRoomsByCreator(
    creator: StringUserID
  ): Promise<Result<StringRoomID[]>> {
    return wrapInTryCatch(
      () =>
        Ok(
          this.db
            .prepare(
              `
              SELECT room_id FROM room_identification WHERE creator = ?`
            )
            .pluck()
            .all(creator) as StringRoomID[]
        ),
      "Error while trying to find created rooms"
    );
  }

  public destroy(): void {
    this.baseStore.destroy();
  }
}
