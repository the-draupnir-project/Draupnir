// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  AnyHandleDescription,
  HandleDataSourceType,
} from "./HandleDescription";
import { SemanticType } from "../../Interface/SemanticType";
import { Ok, Result } from "@gnuxie/typescript-result";
import { HandleRegistry } from "./HandleRegistry";
import { OwnLifetime, StandardLifetime } from "../../Interface/Lifetime";

export interface HandleRegistryDescription<
  TPluginContext = Record<string, unknown>,
  THandles extends AnyHandleDescription = never,
> {
  /**
   * The set of handle descriptions that are available for a particular
   * registry context type.
   */
  readonly handleDescriptions: readonly THandles[];
  /**
   * Phantom property to capture the plugin context type parameter. This
   * is never read at runtime.
   */
  readonly _pluginContext?: TPluginContext;

  registerHandleDescription<THandleDescription extends AnyHandleDescription>(
    description: THandleDescription
  ): HandleRegistryDescription<TPluginContext, THandles | THandleDescription>;

  registryForContext(
    lifetime: OwnLifetime<HandleRegistry<TPluginContext, THandles>>,
    context: TPluginContext
  ): Result<HandleRegistry<TPluginContext, THandles>>;
}

export const HandleRegistryDescriptionSemantics =
  SemanticType<HandleRegistryDescription>("HandleRegistryDescription")
    .declare({
      descriptionBuilding: {
        what: "When a handle is registered and a new registry is returned, the original registry is not modified.",
        why: "Keeps the builder pattern clean and prevents bugs in downstream consumers",
        when: "When registerHandleDescription returns a new HandleRegistryDescription",
        law: "For empty RegistryDescription R and HandleDescription H, calling R.registerHandleDescription(H) => R' results in R.handleDescriptions = [] and R'.handleDescriptions = [H]",
      },
      registryFactory: {
        what: "A HandleRegistryDescription can produce HandleRegistry instances for a given context.",
        why: "Keeps the HandleRegistry abstraction clean by binding the context in construction rather than later on",
        when: "When registryForContext is called with a lifetime and context",
        law: "For RegistryDescription R with handle union H, calling R.registryForContext(L, C) produces a HandleRegistry<R,C>",
      },
    })
    .verify({
      async descriptionBuilding(makeSubject) {
        const registry = (await makeSubject()).expect(
          "Should be able to make the subject"
        );
        const handle = {
          handleName: "handle",
          dataSourceType: HandleDataSourceType.Context,
          establish: () => Ok(undefined),
        };
        const newRegistry = registry.registerHandleDescription(handle);
        expect(registry.handleDescriptions).toHaveLength(0);
        expect(newRegistry.handleDescriptions).toHaveLength(1);
        expect(newRegistry.handleDescriptions[0]).toBe(handle);
      },
      async registryFactory(makeSubject) {
        let establishCount = 0;
        const contextHandle = {
          handleName: "handle",
          dataSourceType: HandleDataSourceType.Context,
          establish: () => {
            establishCount += 1;
            return Ok(undefined);
          },
        } as const;
        const registryDescription = (await makeSubject()).expect(
          "Should be able to make the subject"
        );
        const descriptionWithHandle =
          registryDescription.registerHandleDescription(contextHandle);
        const context = {};
        await using lifetime = new StandardLifetime<HandleRegistry>();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        await using _registry = descriptionWithHandle
          .registryForContext(lifetime, context)
          .expect("Should be able to construct a registry for the context");
        expect(establishCount).toBe(1);
      },
    });
