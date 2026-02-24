// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { AllocatableLifetime, OwnLifetime } from "../../Interface/Lifetime";
import {
  AnyHandleDescription,
  ExtractHandleName,
  HandleDataSourceType,
  HandleDescription,
  PluginWithHandle,
} from "./HandleDescription";
import { HandleRegistry } from "./HandleRegistry";
import { isError, Ok, Result } from "@gnuxie/typescript-result";

export class StandardHandleRegistry<
  TPluginContext = Record<string, unknown>,
  THandles extends AnyHandleDescription = never,
> implements HandleRegistry<TPluginContext, THandles> {
  private readonly handleDescriptions = new Map<string, AnyHandleDescription>();
  private readonly plugins = new Set<PluginWithHandle<THandles>>();

  public constructor(
    private readonly context: TPluginContext,
    private readonly lifetime: OwnLifetime<
      HandleRegistry<TPluginContext, THandles>
    >
  ) {
    // nothing to do.
  }

  private getHandleDescription<THandleName extends string>(
    name: THandleName
  ): HandleDescription<THandleName, TPluginContext> | undefined {
    return this.handleDescriptions.get(name) as HandleDescription<
      THandleName,
      TPluginContext
    >;
  }

  private readonly forwardHandleFromContext = (
    handleName: ExtractHandleName<THandles>,
    ...args: unknown[]
  ) => {
    const handleDescription = this.getHandleDescription(handleName);
    if (handleDescription === undefined) {
      throw new TypeError(`No such handle registered: ${handleName}`);
    }
    for (const plugin of this.plugins) {
      if (handleName in plugin) {
        const pluginHandle = plugin[handleName] as (...args: unknown[]) => void;
        pluginHandle(...args);
      }
    }
  };

  registerHandleDescription<THandleDescription extends AnyHandleDescription>(
    description: THandleDescription
  ): Result<HandleRegistry<TPluginContext, THandles | THandleDescription>> {
    const establishResult =
      description.dataSourceType === HandleDataSourceType.Context
        ? description.establish(
            this.context,
            this.forwardHandleFromContext as never,
            this.lifetime
          )
        : Ok(undefined);
    if (isError(establishResult)) {
      return establishResult;
    }
    this.handleDescriptions.set(description.handleName, description);
    return Ok(this);
  }
  registerPluginHandles(
    plugin: PluginWithHandle<THandles>,
    pluginLifetime: AllocatableLifetime<typeof plugin>
  ): Result<HandleRegistry<TPluginContext, THandles>> {
    if (this.plugins.has(plugin)) {
      return Ok(this);
    }
    for (const handle of this.handleDescriptions.values()) {
      if (handle.handleName in plugin) {
        if (handle.dataSourceType === HandleDataSourceType.Plugin) {
          const establishResult = handle.establish(
            this.context,
            plugin,
            pluginLifetime
          );
          if (isError(establishResult)) {
            return establishResult;
          }
        }
      }
    }
    this.plugins.add(plugin);
    return Ok(this);
  }

  removePluginHandles(plugin: PluginWithHandle<THandles>): void {
    this.plugins.delete(plugin);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.lifetime[Symbol.asyncDispose]();
    this.plugins.clear();
    this.handleDescriptions.clear();
  }
}
