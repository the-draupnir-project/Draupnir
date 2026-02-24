// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, isError } from "@gnuxie/typescript-result";
import { AnyHandleDescription } from "./HandleDescription";
import { HandleRegistryDescription } from "./HandleRegistryDescription";
import { StandardHandleRegistry } from "./StandardHandleRegistry";
import { OwnLifetime } from "../../Interface/Lifetime";
import { HandleRegistry } from "./HandleRegistry";

export class StandardHandleRegistryDescription<
  TPluginContext = Record<string, unknown>,
  THandles extends AnyHandleDescription = never,
> implements HandleRegistryDescription<TPluginContext, THandles> {
  public readonly handleDescriptions: readonly THandles[];

  public constructor(handleDescriptions: readonly THandles[] = []) {
    this.handleDescriptions = handleDescriptions;
  }

  registerHandleDescription<THandleDescription extends AnyHandleDescription>(
    description: THandleDescription
  ): HandleRegistryDescription<TPluginContext, THandles | THandleDescription> {
    return new StandardHandleRegistryDescription<
      TPluginContext,
      THandles | THandleDescription
    >([...this.handleDescriptions, description]);
  }

  registryForContext(
    lifetime: OwnLifetime<HandleRegistry<TPluginContext, THandles>>,
    context: TPluginContext
  ): ReturnType<
    HandleRegistryDescription<TPluginContext, THandles>["registryForContext"]
  > {
    const registry = new StandardHandleRegistry<TPluginContext, THandles>(
      context,
      lifetime
    );
    for (const handle of this.handleDescriptions) {
      const registerResult = registry.registerHandleDescription(handle);
      if (isError(registerResult)) {
        void lifetime[Symbol.asyncDispose]();
        return registerResult;
      }
    }
    return Ok(registry);
  }
}
