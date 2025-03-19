// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-appservice-bridge
// https://github.com/matrix-org/matrix-appservice-bridge
// </text>

import BetterSqlite3, { Database } from "better-sqlite3";
import { Logger } from "matrix-protection-suite";
import { ensureSqliteSchema, SqliteSchemaOptions } from "./SqliteSchema";

export interface BetterSqliteOptions extends BetterSqlite3.Options {
  path: string;
  WALMode?: boolean;
  foreignKeys?: boolean;
}

export function makeBetterSqliteDB(
  options: BetterSqliteOptions,
  log: Logger
): Database {
  log.info("Opening db: ", options.path);
  const db = new BetterSqlite3(options.path, options);
  if (options.path !== ":memory:") {
    db.pragma("temp_store = file"); // Avoid unnecessary memory usage.
  }
  if (options.WALMode) {
    db.pragma("journal_mode = WAL");
  }
  if (options.foreignKeys) {
    db.pragma("foreign_keys = ON");
  }
  let hasEnded = false;
  process.once("beforeExit", () => {
    // Ensure we clean up on exit
    try {
      log.info("Destroy called on db", options.path);
      if (hasEnded) {
        // No-op if end has already been called.
        return;
      }
      hasEnded = true;
      db.close();
      log.info("connection ended on db", options.path);
    } catch (ex) {
      log.warn("Failed to cleanly exit", ex);
    }
  });
  return db;
}

export type SchemaUpdateFunction = (db: Database) => void;

/**
 * BetterSqliteStore datastore abstraction which can be inherited by a specialised bridge class.
 * Please note, that the client library provides synchronous access to sqlite, due to the nature of
 * node.js FFI to C I imagine.
 *
 * @example
 * class MyBridgeStore extends BetterSqliteStore {
 *   constructor(myurl) {
 *     super([schemav1, schemav2, schemav3], { url: myurl });
 *   }
 *
 *   async getData() {
 *     return this.sql`SELECT * FROM mytable`
 *   }
 * }
 *
 * // Which can then be used by doing
 * const store = new MyBridgeStore("data.db");
 * store.ensureSchema();
 * const data = await store.getData();
 */
export class BetterSqliteStore {
  private hasEnded = false;

  /**
   * Construct a new store.
   * @param schemas The set of schema functions to apply to a database. The ordering of this array determines the
   *                schema number.
   * @param opts Options to supply to the BetterSqliteStore client, such as `path`.
   */
  constructor(
    private readonly schema: SqliteSchemaOptions,
    protected readonly db: Database,
    private readonly log: Logger
  ) {
    ensureSqliteSchema(this.db, this.log, this.schema);
  }

  /**
   * Clean away any resources used by the database. This is automatically
   * called before the process exits.
   */
  public destroy(): void {
    this.log.info("Destroy called");
    if (this.hasEnded) {
      // No-op if end has already been called.
      return;
    }
    this.hasEnded = true;
    this.db.close();
    this.log.info("connection ended");
  }
}

/**
 * Wraps `fn` in a transaction without creating nested SAVEPOINTs.
 * Reduces the likelihood of temporary file creation.
 * Initially investigated as part of #746.
 *
 * See https://www.sqlite.org/lang_savepoint.html
 * See https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function
 */
export function flatTransaction<Arguments extends unknown[], Result>(
  db: Database,
  fn: (...args: Arguments) => Result
) {
  const t = db.transaction(fn);
  return (...args: Arguments): Result =>
    db.inTransaction ? fn(...args) : t(...args);
}
