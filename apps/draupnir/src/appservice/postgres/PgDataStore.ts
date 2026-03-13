// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0

import { PostgresStore } from "matrix-appservice-bridge";
import { DataStore, MjolnirRecord } from "../datastore";

import { runSchema as v1 } from "./schema/v1";
import { runSchema as v2 } from "./schema/v2";

const Schema = [v1, v2];

export class PgDataStore extends PostgresStore implements DataStore {
  constructor(connectionString: string) {
    super(Schema, { url: connectionString });
  }

  public async init(): Promise<void> {
    await this.ensureSchema();
  }

  public async close(): Promise<void> {
    await this.destroy();
  }

  public async list(): Promise<MjolnirRecord[]> {
    const result = await this
      .sql`SELECT local_part, owner, management_room FROM draupnir`;
    if (!result.count) {
      return [];
    }

    return result.flat() as MjolnirRecord[];
  }

  public async store(mjolnirRecord: MjolnirRecord): Promise<void> {
    await this.sql`INSERT INTO draupnir (local_part, owner, management_room)
        VALUES (${mjolnirRecord.local_part}, ${mjolnirRecord.owner}, ${mjolnirRecord.management_room})`;
  }

  public async lookupByOwner(owner: string): Promise<MjolnirRecord[]> {
    const result = await this
      .sql`SELECT local_part, owner, management_room FROM draupnir
        WHERE owner = ${owner}`;
    return result.flat() as MjolnirRecord[];
  }

  public async lookupByLocalPart(localPart: string): Promise<MjolnirRecord[]> {
    const result = await this
      .sql`SELECT local_part, owner, management_room FROM draupnir
        WHERE local_part = ${localPart}`;
    return result.flat() as MjolnirRecord[];
  }
}
