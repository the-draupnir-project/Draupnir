// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  Ok,
  Result,
  ResultError,
  isError,
  isOk,
} from "@gnuxie/typescript-result";
import { ConfigDescription } from "./ConfigDescription";
import {
  ConfigErrorDiagnosis,
  ConfigParseError,
  ConfigPropertyError,
  ConfigPropertyUseError,
  ConfigRecoverableError,
} from "./ConfigParseError";
import { StaticEncode, TObject } from "@sinclair/typebox";
import { EDStatic } from "../Interface/Static";
import { Value } from "../Interface/Value";

export type ConfigRecoveryOption = {
  readonly description: string;
  recover(): Promise<Result<void>>;
};

/**
 * Allows the client to load persistent config data.
 * The schema gets verified before its returned.
 * If there is an error with the data, recovery options are provided.
 *
 * Draupnir maintains a list of these which are editable generically
 * via safe mode.
 */
export interface PersistentConfigData<T extends TObject = TObject> {
  readonly description: ConfigDescription<T>;
  requestParsedConfig(): Promise<
    Result<EDStatic<T> | undefined, ResultError | ConfigParseError>
  >;
  saveConfig(config: EDStatic<T>): Promise<Result<void>>;
  // FIXME: hmm is there a way of linking these together so that using a recovery effect
  // invalidates any of the associated recovery options?
  // Be sure not to mandate all recovery options to be tied together though,
  // since there will be one further up which just restarts Draupnir.
  makeRecoveryOptionsForProperty(
    config: Record<string, unknown>,
    key: string
  ): ConfigRecoveryOption[];
  makeRecoveryOptionsForPropertyItem(
    config: Record<string, unknown[]>,
    key: string,
    index: number
  ): ConfigRecoveryOption[];
  makeRecoveryOptionsForError(
    config: Record<string, unknown>,
    error: ResultError
  ): ConfigRecoveryOption[];
  addRecoveryOptionsToResult<T = unknown>(
    config: Record<string, unknown>,
    result: Result<T>
  ): Result<T>;
  reportUseError(
    message: string,
    options: { path: string; value: unknown; cause: ResultError }
  ): Promise<Result<never>>;
}

/**
 * The backend for the `PersistentConfigData` class.
 * Does not serialize or decode data in any way beyond basic JSON deserialization.
 * This is so that the `PersistentConfigData` class has full control over serialization and transformation.
 * @typeParam TEncodedShape This is the shape of the data once it has been transformed into a plain JSON object,
 * without any other JS objects or types.
 */
export interface PersistentConfigBackend<
  TEncodedShape extends Record<string, unknown> = Record<string, unknown>,
> {
  requestUnparsedConfig(): Promise<Result<Record<string, unknown> | undefined>>;
  saveEncodedConfig(data: TEncodedShape): Promise<Result<void>>;
}

export class StandardPersistentConfigData<
  TConfigSchema extends TObject,
> implements PersistentConfigData<TConfigSchema> {
  public constructor(
    public readonly description: ConfigDescription<TConfigSchema>,
    private readonly backend: PersistentConfigBackend<
      StaticEncode<TConfigSchema>
    >
  ) {
    // nothing to do.
  }

  public async requestParsedConfig(): Promise<
    Result<EDStatic<TConfigSchema> | undefined, ResultError | ConfigParseError>
  > {
    const loadResult = await this.backend.requestUnparsedConfig();
    if (isError(loadResult)) {
      return loadResult;
    }
    if (loadResult.ok === undefined) {
      return Ok(undefined);
    }
    return this.addRecoveryOptionsToResult(
      loadResult.ok,
      this.description.parseConfig(loadResult.ok)
    );
  }

  public async saveConfig(
    config: EDStatic<TConfigSchema>
  ): Promise<Result<void>> {
    const encodeResult = Value.Encode(this.description.schema, config);
    if (isError(encodeResult)) {
      return encodeResult;
    }
    return this.backend.saveEncodedConfig(encodeResult.ok);
  }

  private makeRecoveryOptionForConfig() {
    return {
      description: "Reset the configuration to its default values.",
      recover: async () => {
        const newConfig = this.description.getDefaultConfig();
        return await this.saveConfig(newConfig);
      },
    };
  }

  makeRecoveryOptionsForProperty(
    config: Record<string, unknown>,
    key: string
  ): ConfigRecoveryOption[] {
    return [
      {
        description: `Reset the property "${key}" to its default value.`,
        recover: async () => {
          const newConfig = this.description
            .toMirror()
            .removeProperty(key, config);
          return await this.backend.saveEncodedConfig(newConfig);
        },
      },
      this.makeRecoveryOptionForConfig(),
    ];
  }

  makeRecoveryOptionsForPropertyItem(
    config: Record<string, unknown[]>,
    key: string,
    index: number
  ): ConfigRecoveryOption[] {
    return [
      {
        description: `Remove the item "${config[key]?.[index] as string}" from the property "${key}".`,
        recover: async () => {
          const newConfig = this.description
            .toMirror()
            .removeItem(config, key, index);
          return await this.backend.saveEncodedConfig(newConfig);
        },
      },
      ...this.makeRecoveryOptionsForProperty(config, key),
    ];
  }

  makeRecoveryOptionsForError(
    config: Record<string, unknown>,
    error: ResultError
  ): ConfigRecoveryOption[] {
    if (error instanceof ConfigParseError) {
      const mostRelevantError = error.errors[0];
      if (mostRelevantError === undefined) {
        return [this.makeRecoveryOptionForConfig()];
      } else {
        return this.makeRecoveryOptionsForError(config, mostRelevantError);
      }
    } else if (error instanceof ConfigPropertyError) {
      if (error.diagnosis === ConfigErrorDiagnosis.ProblematicArrayItem) {
        return this.makeRecoveryOptionsForPropertyItem(
          config as Record<string, unknown[]>,
          error.topLevelProperty(),
          error.itemIndex()
        );
      } else {
        return this.makeRecoveryOptionsForProperty(
          config,
          error.topLevelProperty()
        );
      }
    } else {
      return [];
    }
  }

  public addRecoveryOptionsToResult<T = unknown>(
    config: Record<string, unknown>,
    result: Result<T>
  ): Result<T> {
    if (isOk(result)) {
      return result;
    } else {
      const options = this.makeRecoveryOptionsForError(config, result.error);
      if (options.length > 0) {
        (result.error as ConfigRecoverableError).addRecoveryOptions(options);
      }
      return result;
    }
  }

  public async reportUseError(
    message: string,
    options: { path: string; value: unknown; cause: ResultError }
  ): Promise<Result<never>> {
    const loadResult = await this.backend.requestUnparsedConfig();
    if (isError(loadResult)) {
      return loadResult;
    }
    if (loadResult.ok === undefined) {
      throw new TypeError("The config defaults must be broken");
    }
    return this.addRecoveryOptionsToResult(
      loadResult.ok,
      ConfigPropertyUseError.Result(message, {
        ...options,
        description: this.description as unknown as ConfigDescription,
      })
    );
  }
}
