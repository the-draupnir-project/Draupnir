// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { TObject } from "@sinclair/typebox";
import { ProtectionDescription } from "../../Protection";
import { ProtectionSettingsConfig } from "./ProtectionSettingsConfig";
import { Ok, Result, isError } from "@gnuxie/typescript-result";
import {
  PersistentConfigBackend,
  StandardPersistentConfigData,
} from "../../../Config/PersistentConfigData";
import { UnknownConfig } from "../../../Config/ConfigDescription";
import { EDStatic } from "../../../Interface/Static";

export type MakePersistentConfigBackendForMjolnirProtectionSettings = (
  protectionDescription: ProtectionDescription
) => Result<PersistentConfigBackend>;

export class MjolnirProtectionSettingsConfig implements ProtectionSettingsConfig {
  public constructor(
    private readonly makePersistentConfigBackend: MakePersistentConfigBackendForMjolnirProtectionSettings
  ) {
    // nothing to do mare.
  }
  public async storeProtectionSettings(
    protectionDescription: ProtectionDescription,
    settings: Record<string, unknown>
  ): Promise<Result<void>> {
    const persistentConfigBackend = this.makePersistentConfigBackend(
      protectionDescription
    );
    if (isError(persistentConfigBackend)) {
      return persistentConfigBackend;
    }
    const persistentConfigData = new StandardPersistentConfigData(
      protectionDescription.protectionSettings,
      persistentConfigBackend.ok
    );
    return await persistentConfigData.saveConfig(settings);
  }
  public async getProtectionSettings<
    TConfigSchema extends TObject = UnknownConfig,
  >(
    protectionDescription: ProtectionDescription
  ): Promise<Result<EDStatic<TConfigSchema>>> {
    const persistentConfigBackend = this.makePersistentConfigBackend(
      protectionDescription
    );
    if (isError(persistentConfigBackend)) {
      return persistentConfigBackend;
    }
    const persistentConfigData = new StandardPersistentConfigData(
      protectionDescription.protectionSettings,
      persistentConfigBackend.ok
    );
    const result = await persistentConfigData.requestParsedConfig();
    if (isError(result)) {
      return result;
    }
    if (result.ok === undefined) {
      return Ok(
        protectionDescription.protectionSettings.getDefaultConfig() as EDStatic<TConfigSchema>
      );
    }
    return result as Result<EDStatic<TConfigSchema>>;
  }
}
