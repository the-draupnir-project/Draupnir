/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 */

import { trace } from "../utils";

export const SCHEMA_VERSION_KEY = 'ge.applied-langua.ge.draupnir.schema_version';

export type RawSchemedData = object & Record<typeof SCHEMA_VERSION_KEY, unknown>;
export type SchemaMigration = (input: RawSchemedData) => Promise<RawSchemedData>;

export abstract class MatrixDataManager<Format extends RawSchemedData = RawSchemedData> {

    protected abstract schema: SchemaMigration[];
    protected abstract isAllowedToInferNoVersionAsZero: boolean;
    protected abstract requestMatrixData(): Promise<unknown>
    protected abstract storeMatixData(data: Format): Promise<void>;
    protected abstract createFirstData(): Promise<Format>;

    @trace
    protected async migrateData(rawData: RawSchemedData): Promise<RawSchemedData> {
        const startingVersion = rawData[SCHEMA_VERSION_KEY] as number;
        // Rememeber, version 0 has no migrations
        if (this.schema.length < startingVersion) {
            throw new TypeError(`Encountered a version that we do not have migrations for ${startingVersion}`);
        } else if (this.schema.length === startingVersion) {
            return rawData;
        } else {
            const applicableSchema = this.schema.slice(startingVersion);
            const migratedData = await applicableSchema.reduce(
                async (previousData: Promise<RawSchemedData>, schema: SchemaMigration) => {
                    return await schema(await previousData)
                }, Promise.resolve(rawData)
            );
            return migratedData;
        }
    }

    @trace
    protected async loadData(): Promise<Format> {
        const rawData = await this.requestMatrixData();
        if (rawData === undefined) {
            return await this.createFirstData();
        } else if (typeof rawData !== 'object' || rawData === null) {
            throw new TypeError("The data has been corrupted.");
        }

        if (!(SCHEMA_VERSION_KEY in rawData) && this.isAllowedToInferNoVersionAsZero) {
            (rawData as RawSchemedData)[SCHEMA_VERSION_KEY] = 0;
        }
        if (SCHEMA_VERSION_KEY in rawData
            && Number.isInteger(rawData[SCHEMA_VERSION_KEY])
        ) {
            // what if the schema migration is somehow incorrect and we are casting as Format?
            return await this.migrateData(rawData) as Format;
        }
        throw new TypeError("The schema version or data has been corrupted")
    }
}
