// Copyright (C) 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ActionError, ActionResult, Ok, isError } from "./Action";

export const DRAUPNIR_SCHEMA_VERSION_KEY =
  "ge.applied-langua.ge.draupnir.schema_version";

export type SchemedData<
  VersionKey extends string = typeof DRAUPNIR_SCHEMA_VERSION_KEY,
  Version extends number = number,
> = { [P in VersionKey]?: Version };

export type SchemaMigration<TSchema extends SchemedData = SchemedData> = (
  input: TSchema,
  toVersion: number
) => Promise<ActionResult<TSchema>>;

export class SchemedDataManager<TSchema extends SchemedData = SchemedData> {
  public constructor(
    private migrationSchema: SchemaMigration<TSchema>[],
    public readonly versionKey: keyof TSchema = DRAUPNIR_SCHEMA_VERSION_KEY
  ) {
    // nothing to do.
  }

  public async migrateData(rawData: TSchema): Promise<ActionResult<TSchema>> {
    // The cast is required because I think, although have not confirmed,
    // TypeScript believes `keyof TSchema` can be any key and not just one
    // that correlates to `Version`. This is a really nasty and complicated
    // mismatch to narrow down.
    const startingVersion =
      (rawData[this.versionKey] as number | undefined) ?? 0;
    // Rememeber, version 0 has no migrations
    if (this.migrationSchema.length < startingVersion) {
      return ActionError.Result(
        `Encountered a version that we do not have migrations for ${startingVersion}`
      );
    } else if (this.migrationSchema.length === startingVersion) {
      return Ok(rawData);
    } else {
      const applicableSchema = this.migrationSchema.slice(startingVersion);
      const migratedData = await applicableSchema.reduce(
        async (
          previous: Promise<ActionResult<TSchema>>,
          schema: SchemaMigration<TSchema>,
          schemaIndex: number
        ) => {
          const previousResult = await previous;
          if (isError(previousResult)) {
            return previousResult;
          }
          return await schema(previousResult.ok, schemaIndex + 1);
        },
        Promise.resolve(Ok(rawData))
      );
      return migratedData;
    }
  }

  public get latestVersion(): number {
    return this.migrationSchema.length;
  }
}
