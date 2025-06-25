// Copyright 2025 Bea <20361868+enbea@users.noreply.github.com>
// Copyright 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import { Database } from "better-sqlite3";
import {
  ActionException,
  ActionExceptionKind,
  Logger,
} from "matrix-protection-suite";

export type SqliteSchemaOptions = {
  upgradeSteps: ((db: Database) => void)[];
  legacyUpgrade?: (db: Database) => void;
  consistencyCheck?: (db: Database) => boolean;
};

export type SqliteSchemaMigrationResult = {
  previousVersion: number;
  version: number;
};

// NOTE: Must be run in a `db.transaction` to rollback on thrown errors
//       and prevent partial upgrades. (allows user to revert to a last
//       known working version of the software in case of errors)
function ensureSchemaPragma(
  db: Database,
  log: Logger,
  { upgradeSteps, consistencyCheck, legacyUpgrade }: SqliteSchemaOptions
): SqliteSchemaMigrationResult {
  // remove this check to allow empty (v0) databases
  if (upgradeSteps.length === 0) {
    throw new TypeError("Missing version definitions.");
  }

  // https://www.sqlite.org/pragma.html#pragma_user_version
  const previousVersion = db.pragma("user_version", { simple: true }) as number;

  if (previousVersion > upgradeSteps.length) {
    throw new RangeError("Database is newer than defined `upgradeSteps`.");
  }

  const tableCount = db
    .prepare('SELECT count(*) FROM "sqlite_master";')
    .pluck()
    .get() as number;
  if (previousVersion === 0 && tableCount > 0) {
    // Database isn't empty, try to migrate it
    log.info("Running legacy schema upgrade");
    if (legacyUpgrade) {
      legacyUpgrade(db);
    } else {
      log.error("Incompatible database"); // log so we can tell which database this is.
      throw new TypeError("Incompatible database");
    }
  }

  // read the version again in case of legacy upgrade changing the number.
  const startAt = db.pragma("user_version", { simple: true }) as number;
  upgradeSteps.slice(startAt).forEach((step) => {
    step(db);
  });
  db.pragma(`user_version = ${upgradeSteps.length}`);
  if (consistencyCheck && !consistencyCheck(db)) {
    throw new Error("Database failed the consistency check.");
  }
  const version = db.pragma("user_version", { simple: true }) as number;
  if (previousVersion !== version) {
    log.info("Migrated database version from", previousVersion, "to", version);
  }
  return {
    previousVersion,
    version,
  };
}

export function ensureSqliteSchema(
  db: Database,
  log: Logger,
  options: SqliteSchemaOptions
): SqliteSchemaMigrationResult {
  const migrationVersion = db.transaction(ensureSchemaPragma)(db, log, options);
  db.exec("VACUUM;"); // why not
  return migrationVersion;
}

export function checkKnownTables(
  db: Database,
  unsortedKnownTables: string[]
): boolean {
  const knownTables = unsortedKnownTables.slice().sort(),
    currentTables = db
      .prepare(`SELECT name FROM "sqlite_master" WHERE type = 'table';`)
      .pluck()
      .all()
      .sort()
      .filter((table: string) => !/^sqlite_/.test(table));
  if (knownTables.length !== currentTables.length) {
    return false;
  }
  if (!knownTables.every((name, i) => currentTables[i] === name)) {
    return false;
  }
  return true;
}

export function wrapInTryCatch<T>(
  cb: () => Result<T>,
  message: string
): Result<T> {
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
