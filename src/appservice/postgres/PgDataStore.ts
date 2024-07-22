// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0

import { PostgresStore, SchemaUpdateFunction } from "matrix-appservice-bridge";
import { DataStore, MjolnirRecord } from "../datastore";

function getSchema(): SchemaUpdateFunction[] {
  const nSchema = 2;
  const schema = [];
  for (let schemaID = 1; schemaID < nSchema + 1; schemaID++) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    schema.push(require(`./schema/v${schemaID}`).runSchema);
  }
  return schema;
}

export class PgDataStore extends PostgresStore implements DataStore {
  constructor(connectionString: string) {
    super(getSchema(), { url: connectionString });
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
