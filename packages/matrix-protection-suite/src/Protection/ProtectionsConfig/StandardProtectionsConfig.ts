// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  PersistentConfigBackend,
  PersistentConfigData,
  StandardPersistentConfigData,
} from "../../Config/PersistentConfigData";
import { ActionResult, Ok, isError, isOk } from "../../Interface/Action";
import { LoggableConfigTracker } from "../../Interface/LoggableConfig";
import { SchemedDataManager } from "../../Interface/SchemedMatrixData";
import { Logger } from "../../Logging/Logger";
import { ProtectionDescription, findProtection } from "../Protection";
import {
  MjolnirEnabledProtectionsDescription,
  MjolnirEnabledProtectionsEncodedShape,
} from "./MjolnirEnabledProtectionsDescription";
import { MjolnirEnabledProtectionsEvent } from "./MjolnirEnabledProtectionsEvent";
import { ProtectionsConfig, ProtectionsInfo } from "./ProtectionsConfig";

const log = new Logger("StandardProtectionsConfig");

export type MissingProtectionCB = (protectionName: string) => void;

async function loadProtecitons(
  config: PersistentConfigData<
    typeof MjolnirEnabledProtectionsDescription.schema
  >,
  {
    migrationHandler,
  }: {
    migrationHandler?:
      | SchemedDataManager<MjolnirEnabledProtectionsEvent>
      | undefined;
  }
): Promise<ActionResult<ProtectionsInfo>> {
  const storeResult = await config.requestParsedConfig();
  if (isError(storeResult)) {
    return storeResult;
  }
  const rawData = storeResult.ok;
  if (rawData === undefined && migrationHandler === undefined) {
    return Ok({
      knownEnabledProtections: [],
      unknownEnabledProtections: [],
    });
  }
  const migrateData = async (): Promise<
    ActionResult<MjolnirEnabledProtectionsEvent>
  > => {
    const defaultProtections = {
      enabled: [],
    };
    if (migrationHandler === undefined) {
      return Ok(defaultProtections);
    } else {
      return await migrationHandler.migrateData(rawData ?? defaultProtections);
    }
  };
  const migratedData = await migrateData();
  if (isError(migratedData)) {
    log.error(`Unable to migrate raw data `, rawData, migratedData.error);
    return migratedData;
  }
  const knownEnabledProtections: ProtectionDescription[] = [];
  const unknownEnabledProtections: string[] = [];
  for (const protecitonName of migratedData.ok.enabled) {
    const description = findProtection(protecitonName);
    if (description === undefined) {
      unknownEnabledProtections.push(protecitonName);
    } else {
      knownEnabledProtections.push(description);
    }
  }
  return Ok({
    knownEnabledProtections,
    unknownEnabledProtections,
  });
}

function applyMissingProtectionCB(
  info: ProtectionsInfo,
  cb?: MissingProtectionCB
): void {
  if (cb === undefined) {
    return;
  }
  for (const protectionName of info.unknownEnabledProtections) {
    cb(protectionName);
  }
}

async function storeProtections(
  info: ProtectionsInfo,
  config: PersistentConfigData<
    typeof MjolnirEnabledProtectionsDescription.schema
  >,
  {
    enabledProtectionsMigration,
  }: {
    enabledProtectionsMigration?:
      | SchemedDataManager<MjolnirEnabledProtectionsEvent>
      | undefined;
  }
): Promise<ActionResult<void>> {
  const combinedEnabledProtections = new Set([
    ...info.knownEnabledProtections.map((protection) => protection.name),
    ...info.unknownEnabledProtections,
  ]);
  return await config.saveConfig({
    enabled: [...combinedEnabledProtections],
    ...(enabledProtectionsMigration === undefined
      ? {}
      : {
          [enabledProtectionsMigration.versionKey]:
            enabledProtectionsMigration.latestVersion,
        }),
  });
}

export class MjolnirProtectionsConfig implements ProtectionsConfig {
  protected constructor(
    private readonly config: PersistentConfigData<
      typeof MjolnirEnabledProtectionsDescription.schema
    >,
    logTracker: LoggableConfigTracker,
    private info: ProtectionsInfo,
    private migrationHandler?: SchemedDataManager<MjolnirEnabledProtectionsEvent>
  ) {
    logTracker.addLoggableConfig(this);
  }
  public static async create(
    store: PersistentConfigBackend<MjolnirEnabledProtectionsEncodedShape>,
    logTracker: LoggableConfigTracker,
    {
      migrationHandler,
      /**
       * It is necessary for some consumers to provide a way to enable/disable protections
       * based the version of software that is being loaded. For example Draupnir
       * needs to enable the `BanPropagationProtection` for users who are upgrading
       * from older versions & for those migrating from Mjolnir.
       * This should not be used to change the structure of the account data itself,
       * because this is supposed to be directly compatible with Mjolnir account data.
       */
      missingProtectionCB,
    }: {
      migrationHandler?: SchemedDataManager<MjolnirEnabledProtectionsEvent>;
      missingProtectionCB?: MissingProtectionCB;
    }
  ): Promise<ActionResult<MjolnirProtectionsConfig>> {
    const config = new StandardPersistentConfigData(
      MjolnirEnabledProtectionsDescription,
      store
    );
    const protectionsInfo = await loadProtecitons(config, { migrationHandler });
    if (isError(protectionsInfo)) {
      return protectionsInfo;
    }
    applyMissingProtectionCB(protectionsInfo.ok, missingProtectionCB);
    return Ok(
      new MjolnirProtectionsConfig(
        config,
        logTracker,
        protectionsInfo.ok,
        migrationHandler
      )
    );
  }

  logCurrentConfig(): void {
    log.info(`current config:`, this.info);
  }

  public async enableProtection<
    TProtectionDescription extends ProtectionDescription,
  >(
    protectionDescription: TProtectionDescription
  ): Promise<ActionResult<void>> {
    const nextInfo = {
      knownEnabledProtections: [
        protectionDescription,
        ...this.getKnownEnabledProtections(),
      ],
      unknownEnabledProtections: this.getUnknownEnabledProtections(),
    };
    const storeResult = await storeProtections(nextInfo, this.config, {
      enabledProtectionsMigration: this.migrationHandler,
    });
    if (isOk(storeResult)) {
      this.info = nextInfo;
    }
    return storeResult;
  }

  public async disableProtection(
    protectionName: string
  ): Promise<ActionResult<void>> {
    const nextInfo: ProtectionsInfo = {
      knownEnabledProtections: this.getKnownEnabledProtections().filter(
        (description) => description.name !== protectionName
      ),
      unknownEnabledProtections: this.getUnknownEnabledProtections().filter(
        (name) => name !== protectionName
      ),
    };
    const storeResult = await storeProtections(nextInfo, this.config, {
      enabledProtectionsMigration: this.migrationHandler,
    });
    if (isOk(storeResult)) {
      this.info = nextInfo;
    }
    return storeResult;
  }

  getKnownEnabledProtections(): ProtectionDescription[] {
    return this.info.knownEnabledProtections;
  }
  getUnknownEnabledProtections(): string[] {
    return this.info.unknownEnabledProtections;
  }
}
