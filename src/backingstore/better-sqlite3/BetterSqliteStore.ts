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

const log = new Logger("BetterSqliteStore");

export function sqliteV0Schema(db: Database) {
    // we have to prepare and run them seperatley becasue prepare checks if the
    // table exists.
    const createTable = db.transaction(() => {
        db.prepare(`CREATE TABLE schema (
            version INTEGER UNIQUE NOT NULL
        ) STRICT;`).run();
        db.prepare('INSERT INTO schema VALUES (0);').run();
    });
    createTable();
}

export interface BetterSqliteOptions extends BetterSqlite3.Options {
    path: string,
    /**
     * Should the schema table be automatically created (the v0 schema effectively).
     * Defaults to `true`.
     */
    autocreateSchemaTable?: boolean;
};

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
export abstract class BetterSqliteStore {
    private hasEnded = false;
    public readonly db: Database;

    public get latestSchema() {
        return this.schemas.length;
    }

    /**
     * Construct a new store.
     * @param schemas The set of schema functions to apply to a database. The ordering of this array determines the
     *                schema number.
     * @param opts Options to supply to the BetterSqliteStore client, such as `path`.
     */
    constructor(private readonly schemas: SchemaUpdateFunction[], private readonly opts: BetterSqliteOptions) {
        opts.autocreateSchemaTable = opts.autocreateSchemaTable ?? true;
        this.db = new BetterSqlite3(opts.path, opts);
        process.once("beforeExit", () => {
            // Ensure we clean up on exit
            try {
                this.destroy()
            } catch (ex) {
                log.warn('Failed to cleanly exit', ex);
            }
        })
    }

    /**
     * Ensure the database schema is up to date. If you supplied
     * `autocreateSchemaTable` to `opts` in the constructor, a fresh database
     * will have a `schema` table created for it.
     *
     * @throws If a schema could not be applied cleanly.
     */
    public ensureSchema(): void {
        log.info("Starting database engine");
        let currentVersion = this.getSchemaVersion();

        if (currentVersion === -1) {
            if (this.opts.autocreateSchemaTable) {
                log.info(`Applying v0 schema (schema table)`);
                sqliteV0Schema(this.db);
                currentVersion = 0;
            } else {
                // We aren't autocreating the schema table, so assume schema 0.
                currentVersion = 0;
            }
        }

        // Zero-indexed, so schema 1 would be in slot 0.
        while (this.schemas[currentVersion]) {
            log.info(`Updating schema to v${currentVersion + 1}`);
            const runSchema = this.schemas[currentVersion];
            try {
                runSchema(this.db);
                currentVersion++;
                this.updateSchemaVersion(currentVersion);
            } catch (ex) {
                log.warn(`Failed to run schema v${currentVersion + 1}:`, ex);
                throw Error("Failed to update database schema");
            }
        }
        log.info(`Database schema is at version v${currentVersion}`);
    }

    /**
     * Clean away any resources used by the database. This is automatically
     * called before the process exits.
     */
    public destroy(): void {
        log.info("Destroy called");
        if (this.hasEnded) {
            // No-op if end has already been called.
            return;
        }
        this.hasEnded = true;
        this.db.close();
        log.info("connection ended");
    }

    /**
     * Update the current schema version.
     * @param version
     */
    protected updateSchemaVersion(version: number): void {
        log.debug(`updateSchemaVersion: ${version}`);
        this.db.prepare(`UPDATE schema SET version = ?;`).run(version);
    }

    /**
     * Get the current schema version.
     * @returns The current schema version, or `-1` if no schema table is found.
     */
    protected getSchemaVersion(): number {
        try {
            const result = this.db.prepare(`SELECT version FROM SCHEMA;`).get() as {version: number}
            return result.version;
        } catch (ex) {
            if (ex instanceof Error && ex.message === 'no such table: SCHEMA') {
                return -1;
            } else {
                log.error("Failed to get schema version", ex);
            }
        }
        throw Error("Couldn't fetch schema version");
    }
}
