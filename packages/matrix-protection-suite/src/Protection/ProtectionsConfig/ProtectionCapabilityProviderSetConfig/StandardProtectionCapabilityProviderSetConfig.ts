// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import { CapabilityProviderSet } from "../../Capability/CapabilitySet";
import { ProtectionDescription } from "../../Protection";
import { ProtectionCapabilityProviderSetConfig } from "./ProtectionCapabilityProviderSetConfig";
import {
  PersistentConfigBackend,
  StandardPersistentConfigData,
} from "../../../Config/PersistentConfigData";
import { describeConfig } from "../../../Config/describeConfig";
import { Type } from "@sinclair/typebox";
import { findCapabilityProvider } from "../../Capability/CapabilityProvider";
import { Logger } from "../../../Logging/Logger";
import {
  DRAUPNIR_SCHEMA_VERSION_KEY,
  SchemedData,
  SchemedDataManager,
} from "../../../Interface/SchemedMatrixData";

const log = new Logger("StandardProtectionCapabilityProviderSetConfig");

export const CapabilityProviderConfig = Type.Object(
  { [DRAUPNIR_SCHEMA_VERSION_KEY]: Type.Optional(Type.Number()) },
  {
    additionalProperties: Type.Object({
      capability_provider_name: Type.String(),
    }),
  }
);
export type CapabilityProviderConfig = SchemedData & {
  [K in Exclude<string, typeof DRAUPNIR_SCHEMA_VERSION_KEY>]: {
    capability_provider_name: string;
  };
};

const CapabilityProviderSetConfigDescription = describeConfig({
  schema: CapabilityProviderConfig,
});

export type MakePersistentConfigBackendForStandardCapabilityProviderSetConfig =
  (
    protectionDescription: ProtectionDescription
  ) => Result<PersistentConfigBackend>;

export class StandardProtectionCapabilityProviderSetConfig implements ProtectionCapabilityProviderSetConfig {
  public constructor(
    private readonly makePersistentConfigBackend: MakePersistentConfigBackendForStandardCapabilityProviderSetConfig,
    private readonly migrationHandler?:
      | SchemedDataManager<CapabilityProviderConfig>
      | undefined
  ) {
    // nothing to do mare.
  }
  public async storeActivateCapabilityProviderSet(
    protectionDescription: ProtectionDescription,
    capabilityproviderSet: CapabilityProviderSet
  ): Promise<Result<void>> {
    const persistentConfigBackend = this.makePersistentConfigBackend(
      protectionDescription
    );
    if (isError(persistentConfigBackend)) {
      return persistentConfigBackend;
    }
    const persistentConfigData = new StandardPersistentConfigData(
      CapabilityProviderSetConfigDescription,
      persistentConfigBackend.ok
    );
    let config: CapabilityProviderConfig = {};
    for (const [capabilityName, capabilityProvider] of Object.entries(
      capabilityproviderSet
    )) {
      config = {
        ...config,
        [capabilityName]: { capability_provider_name: capabilityProvider.name },
      };
    }
    return await persistentConfigData.saveConfig({
      ...config,
      ...(this.migrationHandler === undefined
        ? {}
        : {
            [DRAUPNIR_SCHEMA_VERSION_KEY]: this.migrationHandler.latestVersion,
          }),
    });
  }
  public async getCapabilityProviderSet<
    TProtectionDescription extends ProtectionDescription =
      ProtectionDescription,
  >(
    protectionDescription: TProtectionDescription
  ): Promise<Result<CapabilityProviderSet>> {
    const persistentConfigData = this.makePersistentConfigBackend(
      protectionDescription
    );
    if (isError(persistentConfigData)) {
      return persistentConfigData;
    }
    const result = await persistentConfigData.ok.requestUnparsedConfig();
    if (isError(result)) {
      return result;
    }
    if (result.ok === undefined) {
      return Ok(protectionDescription.defaultCapabilities);
    }
    const migrateData = async (): Promise<Result<CapabilityProviderConfig>> => {
      if (this.migrationHandler === undefined) {
        return Ok(result.ok as CapabilityProviderConfig);
      }
      return await this.migrationHandler.migrateData(
        result.ok as CapabilityProviderConfig
      );
    };
    const migratedResult = await migrateData();
    if (isError(migratedResult)) {
      return migratedResult;
    }
    const capabilityProviderSet = {
      ...protectionDescription.defaultCapabilities,
    };
    const versionKey = DRAUPNIR_SCHEMA_VERSION_KEY;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [versionKey]: _version, ...capabilityConfigs } = migratedResult.ok;
    for (const [capabilityName, providerConfig] of Object.entries(
      capabilityConfigs
    )) {
      const providerDescription = findCapabilityProvider(
        providerConfig.capability_provider_name
      );
      // drats, this should really be a config use error but it's a bitch because
      // we don't eagerly load all the capability configs to create this config,
      // so it is failing late and bad if we use it here.
      if (providerDescription === undefined) {
        log.error(
          `Unable to find a capability provider for ${providerConfig.capability_provider_name} in the protection ${protectionDescription.name}, so using the default for the ${capabilityName}`
        );
        continue;
      }
      capabilityProviderSet[capabilityName] = providerDescription;
    }
    return Ok(capabilityProviderSet);
  }
}
