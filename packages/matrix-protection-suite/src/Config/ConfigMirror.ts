// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  Evaluate,
  StaticDecode,
  TArray,
  TObject,
  TProperties,
} from "@sinclair/typebox";
import { ConfigDescription } from "./ConfigDescription";
import { EDStatic } from "../Interface/Static";
import { ConfigPropertyError } from "./ConfigParseError";
import { Ok, Result, isError } from "@gnuxie/typescript-result";
import { Value as TBValue } from "@sinclair/typebox/value";
import { Value } from "../Interface/Value";

// We should really have a conditional type here for unknown config.
export interface ConfigMirror<TConfigSchema extends TObject = TObject> {
  readonly description: ConfigDescription<TConfigSchema>;
  setValue<TKey extends string>(
    config: EDStatic<TConfigSchema>,
    key: TKey,
    value: unknown
  ): Result<EDStatic<TConfigSchema>, ConfigPropertyError>;
  setSerializedValue<TKey extends string>(
    config: EDStatic<TConfigSchema>,
    key: TKey,
    value: string
  ): Result<EDStatic<TConfigSchema>, ConfigPropertyError>;
  addItem<TKey extends string>(
    config: EDStatic<TConfigSchema>,
    key: TKey,
    value: unknown
  ): Result<EDStatic<TConfigSchema>, ConfigPropertyError>;
  addSerializedItem<TKey extends string>(
    config: EDStatic<TConfigSchema>,
    key: TKey,
    value: string
  ): Result<EDStatic<TConfigSchema>, ConfigPropertyError>;
  // needed for when additionalProperties is true.
  removeProperty<TKey extends string>(
    key: TKey,
    config: Record<TKey, unknown>
  ): Record<TKey, unknown>;
  removeItem<TKey extends string>(
    config: Record<TKey, unknown[]>,
    key: TKey,
    index: number
  ): Record<TKey, unknown[]>;
  filterItems<TKey extends string>(
    config: Record<TKey, unknown[]>,
    key: TKey,
    callbackFn: Parameters<Array<unknown>["filter"]>[0]
  ): Record<TKey, unknown[]>;
}

export class StandardConfigMirror<
  TConfigSchema extends TObject,
> implements ConfigMirror<TConfigSchema> {
  public constructor(
    public readonly description: ConfigDescription<TConfigSchema>
  ) {
    // nothing to do.
  }
  setValue(
    config: Evaluate<StaticDecode<TConfigSchema>>,
    key: string,
    value: unknown
  ): Result<Evaluate<StaticDecode<TConfigSchema>>, ConfigPropertyError> {
    const schema = this.description.schema.properties[key as keyof TProperties];
    if (schema === undefined) {
      throw new TypeError(`Property ${key} does not exist in schema`);
    }
    const errors = [...TBValue.Errors(schema, value)];
    if (errors[0] !== undefined) {
      return ConfigPropertyError.Result(errors[0].message, {
        path: `/${key}`,
        value,
        description: this.description as unknown as ConfigDescription,
      });
    }
    const newConfig = {
      ...config,
      [key]: value,
    };
    return Ok(newConfig as EDStatic<TConfigSchema>);
  }
  private addUnparsedItem(
    config: Evaluate<StaticDecode<TConfigSchema>>,
    key: keyof Evaluate<StaticDecode<TConfigSchema>>,
    value: unknown
  ): Evaluate<StaticDecode<TConfigSchema>> {
    const schema = this.description.schema.properties[key as keyof TProperties];
    if (schema === undefined) {
      throw new TypeError(
        `Property ${key.toString()} does not exist in schema`
      );
    }
    if (!("items" in schema)) {
      throw new TypeError(`Property ${key.toString()} is not an array`);
    }
    const isSet = "uniqueItems" in schema && schema.uniqueItems === true;
    if (isSet) {
      const set = new Set(config[key] as unknown[]);
      set.add(TBValue.Decode((schema as TArray).items, value));
      return {
        ...config,
        [key]: [...set],
      };
    } else {
      return {
        ...config,
        [key]: [...(config[key] as unknown[]), TBValue.Decode(schema, value)],
      };
    }
  }
  addItem(
    config: Evaluate<StaticDecode<TConfigSchema>>,
    key: string,
    value: unknown
  ): Result<Evaluate<StaticDecode<TConfigSchema>>, ConfigPropertyError> {
    const schema = this.description.schema.properties[key as keyof TProperties];
    if (schema === undefined) {
      throw new TypeError(`Property ${key} does not exist in schema`);
    }
    const currentItems = config[key as keyof EDStatic<TConfigSchema>];
    if (!Array.isArray(currentItems)) {
      throw new TypeError(`Property ${key} is not an array`);
    }
    const errors = [
      ...TBValue.Errors(schema, [
        ...(config[key as keyof EDStatic<TConfigSchema>] as unknown[]),
        value,
      ]),
    ];
    if (errors[0] !== undefined) {
      return ConfigPropertyError.Result(errors[0].message, {
        path: `/${key}${errors[0].path}`,
        value,
        description: this.description as unknown as ConfigDescription,
      });
    }
    return Ok(
      this.addUnparsedItem(config, key as keyof EDStatic<TConfigSchema>, value)
    );
  }
  addSerializedItem<TKey extends string>(
    config: EDStatic<TConfigSchema>,
    key: TKey,
    value: string
  ): Result<EDStatic<TConfigSchema>, ConfigPropertyError> {
    const propertySchema =
      this.description.schema.properties[key as keyof TProperties];
    if (propertySchema === undefined) {
      throw new TypeError(`Property ${key} does not exist in schema`);
    }
    if (!("items" in propertySchema)) {
      throw new TypeError(`Property ${key} is not an array`);
    }
    const itemSchema = (propertySchema as TArray).items;
    const decodeResult = Value.Decode(itemSchema, value);
    if (isError(decodeResult)) {
      return ConfigPropertyError.Result(decodeResult.error.message, {
        path: `/${key}`,
        value,
        description: this.description as unknown as ConfigDescription,
      });
    }
    return Ok(
      this.addUnparsedItem(
        config,
        key as unknown as keyof EDStatic<TConfigSchema>,
        decodeResult.ok
      )
    );
  }
  setSerializedValue<TKey extends string>(
    config: EDStatic<TConfigSchema>,
    key: TKey,
    value: string
  ): Result<EDStatic<TConfigSchema>, ConfigPropertyError> {
    const schema = this.description.schema.properties[key as keyof TProperties];
    if (schema === undefined) {
      throw new TypeError(`Property ${key} does not exist in schema`);
    }
    const decodeResult = Value.Decode(schema, value);
    if (isError(decodeResult)) {
      return ConfigPropertyError.Result(decodeResult.error.message, {
        path: `/${key}`,
        value,
        description: this.description as unknown as ConfigDescription,
      });
    }
    return this.setValue(config, key, decodeResult.ok);
  }
  removeProperty<TKey extends string>(
    key: TKey,
    config: Record<TKey, unknown>
  ): Record<string, unknown> {
    return Object.entries(config).reduce<Record<string, unknown>>(
      (acc, [k, v]) => {
        if (k !== key) {
          acc[k as TKey] = v;
        }
        return acc;
      },
      {}
    );
  }
  removeItem<TKey extends string>(
    config: Record<TKey, unknown[]>,
    key: TKey,
    index: number
  ): Record<TKey, unknown[]> {
    return {
      ...config,
      [key]: config[key].filter((_, i) => i !== index),
    };
  }

  filterItems<TKey extends string>(
    config: Record<TKey, unknown[]>,
    key: TKey,
    callbackFn: Parameters<Array<unknown>["filter"]>[0]
  ): Record<TKey, unknown[]> {
    return {
      ...config,
      [key]: config[key].filter(callbackFn),
    };
  }
}
