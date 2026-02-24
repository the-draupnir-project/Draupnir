// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result } from "@gnuxie/typescript-result";
import { SemanticType } from "../../Interface/SemanticType";
import {
  AllocatableLifetime,
  StandardLifetime,
} from "../../Interface/Lifetime";
import {
  AnyHandleDescription,
  HandleDataSourceType,
  HandleDescription,
  PluginWithHandle,
} from "./HandleDescription";
import { HandleRegistryDescription } from "./HandleRegistryDescription";

/**
 * HandleRegistry is concerned with establishing plugin handles against a context
 * instance. It uses a HandleRegistryDescription to figure out which handles
 * should be established for a given type of context.
 */
export interface HandleRegistry<
  TPluginContext = Record<string, unknown>,
  THandles extends AnyHandleDescription = never,
> {
  registerPluginHandles(
    plugin: PluginWithHandle<THandles>,
    pluginLifetime: AllocatableLifetime<typeof plugin>
  ): Result<HandleRegistry<TPluginContext, THandles>>;
  removePluginHandles(plugin: PluginWithHandle<THandles>): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export const HandleRegistrySemantics = SemanticType<HandleRegistryDescription>(
  "HandleRegistry"
).Law({
  establishHandles: {
    what: "When registerPluginHandles is called, plugins will later receive calls for their handles",
    why: "Provides the hook point for plugins to register with handles",
    law: "For plugin P and handle H, registering plugin will result in handle H being called on plugin when invoked",
    async check(makeSubject) {
      const description = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      type EstablishHandlesDescription = HandleDescription<
        "testHandle",
        Record<string, unknown>,
        () => void
      >;
      let publishHandleCallback:
        | ((handleName: "testHandle") => void)
        | undefined;
      let handleInvocations = 0;
      const testHandleDescription: EstablishHandlesDescription = {
        handleName: "testHandle",
        dataSourceType: HandleDataSourceType.Context,
        establish(_context, callback) {
          publishHandleCallback = callback;
          return Ok(undefined);
        },
      };
      const descriptionWithHandle = description.registerHandleDescription(
        testHandleDescription
      );
      await using registryLifetime = new StandardLifetime<HandleRegistry>();
      const testPlugin = {
        testHandle() {
          handleInvocations += 1;
        },
      };
      await using lifetime = new StandardLifetime<typeof testPlugin>();
      descriptionWithHandle
        .registryForContext(registryLifetime, {})
        .expect("registry creation failed")
        .registerPluginHandles(testPlugin, lifetime);
      if (publishHandleCallback === undefined) {
        throw new TypeError(
          "Handle establishment did not provide a publish callback"
        );
      }
      publishHandleCallback("testHandle");
      if (handleInvocations !== 1) {
        throw new TypeError("Registered handle was not invoked after publish");
      }
    },
  },
  pluginRemoval: {
    what: "Handles will no longer be called on plugins that are unregistered",
    why: "Make sure that plugins can be cleanly removed from the system",
    law: "For plugin P and handle H, after unregistering P, H will no longer be called on P",
    async check(makeSubject) {
      const description = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      type RemovalHandleDescription = HandleDescription<
        "handle",
        Record<string, unknown>,
        () => void
      >;
      let publishHandleCallback: ((handleName: "handle") => void) | undefined;
      let handleInvocations = 0;
      const handle: RemovalHandleDescription = {
        handleName: "handle",
        dataSourceType: HandleDataSourceType.Context,
        establish(_context, publish) {
          publishHandleCallback = publish;
          return Ok(undefined);
        },
      };
      const descriptionWithHandle =
        description.registerHandleDescription(handle);
      await using registryLifetime = new StandardLifetime<HandleRegistry>();
      await using registry = descriptionWithHandle
        .registryForContext(registryLifetime, {})
        .expect("Should be able to construct registry for context");
      const plugin = {
        handle() {
          handleInvocations += 1;
        },
      };
      await using pluginLifetime = new StandardLifetime<typeof plugin>();
      registry
        .registerPluginHandles(plugin, pluginLifetime)
        .expect("Should be able to register plugin handles");
      if (publishHandleCallback === undefined) {
        throw new TypeError(
          "Handle establishment did not provide a publish callback"
        );
      }
      publishHandleCallback("handle");
      registry.removePluginHandles(plugin);
      publishHandleCallback("handle");
      if (handleInvocations !== 1) {
        throw new TypeError(
          "Handle was invoked after plugin removal. It should not be."
        );
      }
    },
  },
  unaryHandleRegistration: {
    what: "Plugin registration is unary, handles will not be called multiple times as a result of multiple registration",
    why: "Prevents bugs from multiple registration",
    law: "For a plugin P, and handle H, calling registerHandles(P) twice will result in H of P being called exactly once only",
    async check(makeSubject) {
      const description = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      type UnaryHandleDescription = HandleDescription<
        "handle",
        Record<string, unknown>,
        () => void
      >;
      let establishCount = 0;
      const handle: UnaryHandleDescription = {
        handleName: "handle",
        dataSourceType: HandleDataSourceType.Plugin,
        establish: () => {
          establishCount += 1;
          return Ok(undefined);
        },
      };
      const descriptionWithHandle =
        description.registerHandleDescription(handle);
      await using registryLifetime = new StandardLifetime<HandleRegistry>();
      await using registry = descriptionWithHandle
        .registryForContext(registryLifetime, {})
        .expect("Should be able to construct registry for context");
      let handleInvocations = 0;
      const plugin = {
        handle() {
          handleInvocations += 1;
        },
      };
      await using pluginLifetime = new StandardLifetime<typeof plugin>();
      registry
        .registerPluginHandles(plugin, pluginLifetime)
        .expect("Should be able to register plugin handles");
      registry
        .registerPluginHandles(plugin, pluginLifetime)
        .expect("Should be able to re-register plugin handles");
      if (establishCount !== 1) {
        throw new TypeError(
          "Plugin handle establish should only have been called once"
        );
      }
      plugin.handle();
      if (handleInvocations !== 1) {
        throw new TypeError("Plugin handle should have been called once");
      }
    },
  },
  disposable: {
    what: "HandleRegistry un-registers all plugins on disposal",
    why: "Prevents resource leaks from HandleRegistry instances",
    law: "For plugin P and handle H, after disposing the HandleRegistry, H will no longer be called on P",
    async check(makeSubject) {
      const description = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      type DisposableHandleDescription = HandleDescription<
        "handle",
        Record<string, unknown>,
        () => void
      >;
      let publishHandleCallback: ((handleName: "handle") => void) | undefined;
      let handleInvocations = 0;
      const handle: DisposableHandleDescription = {
        handleName: "handle",
        dataSourceType: HandleDataSourceType.Context,
        establish(_context, publish) {
          publishHandleCallback = publish;
          return Ok(undefined);
        },
      };
      const descriptionWithHandle =
        description.registerHandleDescription(handle);
      {
        await using registryLifetime = new StandardLifetime<HandleRegistry>();
        await using registry = descriptionWithHandle
          .registryForContext(registryLifetime, {})
          .expect("Should be able to construct registry for context");
        const plugin = {
          handle() {
            handleInvocations += 1;
          },
        };
        await using pluginLifetime = new StandardLifetime<typeof plugin>();
        registry
          .registerPluginHandles(plugin, pluginLifetime)
          .expect("Should be able to register plugin handles");
        if (publishHandleCallback === undefined) {
          throw new TypeError(
            "Handle establishment did not provide a publish callback"
          );
        }
        publishHandleCallback("handle");
      }
      try {
        publishHandleCallback("handle");
      } catch {
        // catch errors from invoking after disposal
      }
      if (handleInvocations !== 1) {
        throw new TypeError(
          "Handle was invoked after registry disposal. It should not be."
        );
      }
    },
  },
});
