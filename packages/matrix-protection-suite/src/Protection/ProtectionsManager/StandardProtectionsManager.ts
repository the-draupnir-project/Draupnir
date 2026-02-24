// Copyright 2023 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  CapabilityProviderSet,
  initializeCapabilitySet,
} from "../Capability/CapabilitySet";
import { ProtectedRoomsSet } from "../ProtectedRoomsSet";
import { Protection, ProtectionDescription } from "../Protection";
import {
  ProtectionFailedToStartCB,
  ProtectionsManager,
} from "./ProtectionsManager";
import { ProtectionSettingsConfig } from "../ProtectionsConfig/ProtectionSettingsConfig/ProtectionSettingsConfig";
import { ProtectionCapabilityProviderSetConfig } from "../ProtectionsConfig/ProtectionCapabilityProviderSetConfig/ProtectionCapabilityProviderSetConfig";
import { ProtectionsConfig } from "../ProtectionsConfig/ProtectionsConfig";
import { Logger } from "../../Logging/Logger";
import { TObject } from "@sinclair/typebox";
import { EDStatic } from "../../Interface/Static";
import { UnknownConfig } from "../../Config/ConfigDescription";
import { CapabilityProviderDescription } from "../Capability/CapabilityProvider";
import { OwnLifetime, StandardLifetime } from "../../Interface/Lifetime";
import { Task } from "../../Interface/Task";
import { HandleRegistry } from "../HandleRegistry/HandleRegistry";
import { HandleRegistryDescription } from "../HandleRegistry/HandleRegistryDescription";
import { AnyHandleDescription } from "../HandleRegistry/HandleDescription";

const log = new Logger("StandardProtectionsManager");

// FIXME: Dialemma, if we want to be able to change protection settings
// or dry run protections with dummy capabilities, we need to know whether
// the protection has external resources that will conflict.
// So for example, a webserver or something like that, we need to make sure that
// both protections can run at the same time. This would mean duplicating
// the listeners for a webserver and we need to warn protections about this
// in the documentation.

export class StandardProtectionsManager<
  Context = unknown,
> implements ProtectionsManager<Context> {
  private readonly lifetime: OwnLifetime<ProtectionsManager<Context>> =
    new StandardLifetime();
  private readonly enabledProtections = new Map<
    /** protection name */ string,
    Protection<ProtectionDescription>
  >();

  private handleRegistry: HandleRegistry<Context> | null = null;

  public getHandleRegistry(context: Context): Result<HandleRegistry<Context>> {
    if (this.handleRegistry !== null) {
      return Ok(this.handleRegistry);
    }
    const lifetimeResult = this.lifetime.toChild();
    if (isError(lifetimeResult)) {
      return lifetimeResult.elaborate(
        "Unable to allocate lifetime for handle registry"
      );
    }
    const registryResult = this.handleRegistryDescription.registryForContext(
      lifetimeResult.ok,
      context
    );
    if (isError(registryResult)) {
      void lifetimeResult.ok[Symbol.asyncDispose]();
      return registryResult;
    }
    this.handleRegistry = registryResult.ok;
    return Ok(this.handleRegistry);
  }

  public constructor(
    private readonly enabledProtectionsConfig: ProtectionsConfig,
    private readonly capabilityProviderSetConfig: ProtectionCapabilityProviderSetConfig,
    private readonly settingsConfig: ProtectionSettingsConfig,
    private readonly handleRegistryDescription: HandleRegistryDescription<
      Context,
      AnyHandleDescription
    >
  ) {
    // nothing to do.
  }

  public get allProtections() {
    return [...this.enabledProtections.values()];
  }

  private async startProtection(
    protectionDescription: ProtectionDescription,
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context,
    {
      settings,
      capabilityProviderSet,
    }: {
      settings?: Record<string, unknown> | undefined;
      capabilityProviderSet?: CapabilityProviderSet | undefined;
    }
  ): Promise<Result<Protection<ProtectionDescription>>> {
    if (settings === undefined) {
      const settingsResult = await this.settingsConfig.getProtectionSettings(
        protectionDescription
      );
      if (isError(settingsResult)) {
        return settingsResult;
      }
      settings = settingsResult.ok;
    }
    if (capabilityProviderSet === undefined) {
      const capabilityProviders =
        await this.capabilityProviderSetConfig.getCapabilityProviderSet(
          protectionDescription
        );
      if (isError(capabilityProviders)) {
        return capabilityProviders.elaborate(
          `Couldn't find the capability provider set for ${protectionDescription.name}`
        );
      }
      capabilityProviderSet = capabilityProviders.ok;
    }
    const capabilities = initializeCapabilitySet(
      protectionDescription,
      capabilityProviderSet,
      context
    );
    const handleRegistryResult = this.getHandleRegistry(context);
    if (isError(handleRegistryResult)) {
      return handleRegistryResult.elaborate(
        `Unable to establish handles for ${protectionDescription.name}`
      );
    }
    const lifetimeResult = this.lifetime.toChild();
    if (isError(lifetimeResult)) {
      return lifetimeResult.elaborate(
        "Unable to allocate lifetime for protection"
      );
    }
    const protectionResult = await protectionDescription.factory(
      protectionDescription,
      lifetimeResult.ok,
      protectedRoomsSet,
      context,
      capabilities,
      settings
    );
    if (isError(protectionResult)) {
      return protectionResult;
    }
    const handleRegistrationResult =
      handleRegistryResult.ok.registerPluginHandles(
        protectionResult.ok,
        lifetimeResult.ok
      );
    if (isError(handleRegistrationResult)) {
      try {
        await protectionResult.ok[Symbol.asyncDispose]();
      } catch (e) {
        log.error(
          `Caught unhandled exception while disposing failed protection ${protectionDescription.name}:`,
          e
        );
      }
      return handleRegistrationResult.elaborate(
        `Unable to register handles for ${protectionDescription.name}`
      );
    }
    const enabledProtection = this.enabledProtections.get(
      protectionDescription.name
    );
    if (enabledProtection !== undefined) {
      await this.removeProtectionWithoutStore(protectionDescription);
    }
    this.enabledProtections.set(
      protectionDescription.name,
      protectionResult.ok
    );
    return protectionResult;
  }

  public async addProtection(
    protectionDescription: ProtectionDescription,
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context
  ): Promise<Result<void>> {
    const startResult = await this.startProtection(
      protectionDescription,
      protectedRoomsSet,
      context,
      {}
    );
    if (isError(startResult)) {
      return startResult;
    }
    const storeResult = await this.enabledProtectionsConfig.enableProtection(
      protectionDescription
    );
    return storeResult;
  }
  private async removeProtectionWithoutStore(
    protectionDescription: ProtectionDescription
  ): Promise<void> {
    const protection = this.enabledProtections.get(protectionDescription.name);
    this.enabledProtections.delete(protectionDescription.name);
    if (protection !== undefined) {
      const registry = this.handleRegistry;
      registry?.removePluginHandles(protection);
      try {
        await protection[Symbol.asyncDispose]();
      } catch (ex) {
        log.error(
          `Caught unhandled exception while disabling ${protectionDescription.name}:`,
          ex
        );
      }
    }
  }
  public async removeProtection(
    protection: ProtectionDescription
  ): Promise<Result<void>> {
    const storeResult = await this.enabledProtectionsConfig.disableProtection(
      protection.name
    );
    if (isError(storeResult)) {
      return storeResult;
    }
    await this.removeProtectionWithoutStore(protection);
    return Ok(undefined);
  }
  public async loadProtections(
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context,
    protectionFailedToStart: ProtectionFailedToStartCB
  ): Promise<Result<void>> {
    if (this.allProtections.length > 0) {
      throw new TypeError("This can only be used at startup");
    }
    for (const protectionDescription of this.enabledProtectionsConfig.getKnownEnabledProtections()) {
      const startResult = await this.startProtection(
        protectionDescription,
        protectedRoomsSet,
        context,
        {}
      );
      if (isError(startResult)) {
        await protectionFailedToStart(
          startResult.error,
          protectionDescription.name,
          protectionDescription
        );
        continue;
      }
    }
    return Ok(undefined);
  }
  public async changeProtectionSettings<
    TProtectionDescription extends ProtectionDescription =
      ProtectionDescription,
  >(
    protectionDescription: TProtectionDescription,
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context,
    settings: Record<string, unknown>
  ): Promise<Result<Protection<TProtectionDescription>>> {
    // It is important that we check that storing the settings is successful
    // BEFORE enabling the new protection. This is to make sure that a cascade
    // failure cannot occur when a protection can modify its own settings at
    // startup.
    // The current settings are used to restore the previous state if the protection
    // cannot start through a config use error.
    const currentSettings = await this.settingsConfig.getProtectionSettings(
      protectionDescription
    );
    if (isError(currentSettings)) {
      return currentSettings.elaborate(
        "Couldn't fetch the current settings so they cannot be changed"
      );
    }
    const settingsResult = await this.settingsConfig.storeProtectionSettings(
      protectionDescription,
      settings
    );
    if (isError(settingsResult)) {
      return settingsResult.elaborate(
        "Could not store the changed protection settings"
      );
    }
    const protectionEnableResult = await this.startProtection(
      protectionDescription,
      protectedRoomsSet,
      context,
      { settings }
    );
    if (isError(protectionEnableResult)) {
      const restoreResult = await this.settingsConfig.storeProtectionSettings(
        protectionDescription,
        currentSettings.ok
      );
      if (isError(restoreResult)) {
        log.error(
          `Unable to restore original settings for ${protectionDescription.name}:`,
          restoreResult
        );
      } else {
        log.info(
          `Restored the previous settings for ${protectionDescription.name} as the protection would not start`
        );
      }
      return protectionEnableResult.elaborate(
        "Could not restart the protection with the new settings"
      );
    }

    return protectionEnableResult as Result<Protection<TProtectionDescription>>;
  }

  public async changeCapabilityProvider(
    context: Context,
    protectedRoomsSet: ProtectedRoomsSet,
    protectionDescription: ProtectionDescription,
    capabilityKey: string,
    capabilityProvider: CapabilityProviderDescription
  ): Promise<Result<void>> {
    const currentCapabilityProviderSet =
      await this.capabilityProviderSetConfig.getCapabilityProviderSet(
        protectionDescription
      );
    if (isError(currentCapabilityProviderSet)) {
      return currentCapabilityProviderSet;
    }
    const capabilityInterface =
      protectionDescription.capabilities[capabilityKey];
    if (capabilityInterface === undefined) {
      return ResultError.Result(
        `Cannot find the capability interface ${capabilityKey} for ${protectionDescription.name}`
      );
    }
    if (capabilityProvider.interface !== capabilityInterface) {
      return ResultError.Result(
        `The capability provider ${capabilityProvider.name} does not implement the interface ${capabilityInterface.name}`
      );
    }
    const newCapabilityProviderSet = {
      ...currentCapabilityProviderSet.ok,
      [capabilityKey]: capabilityProvider,
    };
    currentCapabilityProviderSet.ok[capabilityKey] = capabilityProvider;
    return await this.changeCapabilityProviderSet(
      protectionDescription,
      protectedRoomsSet,
      context,
      newCapabilityProviderSet
    );
  }
  public async changeCapabilityProviderSet(
    protectionDescription: ProtectionDescription,
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context,
    capabilityProviderSet: CapabilityProviderSet
  ): Promise<Result<void>> {
    const result = await this.startProtection(
      protectionDescription,
      protectedRoomsSet,
      context,
      { capabilityProviderSet }
    );
    if (isError(result)) {
      return result;
    }
    return await this.capabilityProviderSetConfig.storeActivateCapabilityProviderSet(
      protectionDescription,
      capabilityProviderSet
    );
  }
  public async getCapabilityProviderSet(
    protectionDescription: ProtectionDescription
  ): Promise<Result<CapabilityProviderSet>> {
    return await this.capabilityProviderSetConfig.getCapabilityProviderSet(
      protectionDescription
    );
  }
  public async getProtectionSettings<
    TConfigSchema extends TObject = UnknownConfig,
  >(
    protectionDescription: ProtectionDescription
  ): Promise<Result<EDStatic<TConfigSchema>>> {
    return (await this.settingsConfig.getProtectionSettings(
      protectionDescription
    )) as Result<EDStatic<TConfigSchema>>;
  }
  isEnabledProtection(protectionDescription: ProtectionDescription): boolean {
    return this.enabledProtections.has(protectionDescription.name);
  }
  findEnabledProtection<TProtectionDescription extends ProtectionDescription>(
    name: string
  ): Protection<TProtectionDescription> | undefined {
    return this.enabledProtections.get(name) as
      | Protection<TProtectionDescription>
      | undefined;
  }
  withEnabledProtection<TProtectionDescription extends ProtectionDescription>(
    name: string,
    cb: (protection: Protection<TProtectionDescription>) => void
  ): void {
    const protection = this.findEnabledProtection(name);
    if (protection !== undefined) {
      cb(protection as Protection<TProtectionDescription>);
    }
  }

  unregisterListeners(): void {
    // In future when the StandardProtectionsManager accepts a lifetime as a
    // dependency itself, this will need to be deleted.
    void Task(
      (async () => {
        await this.lifetime[Symbol.asyncDispose]();
        this.enabledProtections.clear();
      })(),
      { log }
    );
  }
}
