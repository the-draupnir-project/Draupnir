// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { TObject } from "@sinclair/typebox";
import { ActionError, ActionResult } from "../../Interface/Action";
import { CapabilityProviderSet } from "../Capability/CapabilitySet";
import { ProtectedRoomsSet } from "../ProtectedRoomsSet";
import { Protection, ProtectionDescription } from "../Protection";
import { EDStatic } from "../../Interface/Static";
import { UnknownConfig } from "../../Config/ConfigDescription";
import { CapabilityProviderDescription } from "../Capability/CapabilityProvider";

/**
 * The idea needs to be that protections are defined using a state event
 * that contains their settings. so e.g.
 * ge.applied-langua.ge.draupnir.protection with state key "TrustedReporters"
 * would have a `settings` key that would initialize the `TrustedReporters`
 * protection with `settings` as options. If `settings` doesn't validate
 * you just give the user the option to use the default settings.
 */

/**
 * A callback that will be called when a protection fails to start
 * for the first time when loading protections.
 * So for Draupnir, this would only be when Draupnir starts up, and explicitly
 * not when a protection is added or removed or the settings are changed.
 */
export type ProtectionFailedToStartCB = (
  /** The problem leading to the failure. */
  Error: ActionError,
  /** The name of the protection as given in the `enabled_protections` config. */
  protectionName: string,
  /** The protection description, if it can be found. */
  ProtectionDescription?: ProtectionDescription
) => Promise<void>;

export interface ProtectionsManager<Context = unknown> {
  readonly allProtections: Protection<ProtectionDescription<Context>>[];
  /**
   * Activate a protection, constructing it from the description by using the
   * pre-configured context,
   * protectedRoomsSet,
   * and capabilityProviderSet as arguments to the factory located in the protectionDescription.
   */
  addProtection(
    protectionDescription: ProtectionDescription<Context>,
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context
  ): Promise<ActionResult<void>>;
  /**
   * If an instance of the protection is running then stop it and disable it.
   */
  removeProtection(
    protection: ProtectionDescription<Context>
  ): Promise<ActionResult<void>>;

  /**
   * Load protections for the first time after instantiating ProtectionsConfig
   * and the entire ProtectedRoomsSet.
   * This would be done within the factory method to ProtectionsConfig implementations
   * if there wasn't a dependency for protections on the ProtectedRoomsSet, which
   * has a dependency on ProtectionsConfig.
   * @param consequenceProvider A provider to the consequences of all protections,
   * this will be changed in a future version where consequence providers will be per protection.
   * @param protectedRoomsSet The protected rooms set that the protection is being used within.
   * @param protectionFailedToStart A callback to be called should one of the protections fail to start.
   */
  loadProtections(
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context,
    protectionFailedToStart: ProtectionFailedToStartCB
  ): Promise<ActionResult<void>>;

  /**
   * Change the protection settings.
   * If the protection is currently enabled, then the protection will be stopped,
   * removed recreated from the description and restarted.
   * @param protectionDescription The protection whose settings need to change.
   * @param settings The parsed settings for the protection. If these are wrong,
   * then this method will fail.
   */
  changeProtectionSettings<
    TProtectionDescription extends ProtectionDescription =
      ProtectionDescription,
  >(
    protectionDescription: TProtectionDescription,
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context,
    settings: Record<string, unknown>
  ): Promise<ActionResult<Protection<TProtectionDescription>>>;

  /**
   * Change the current capability provider for a specific capability interface
   * in a set for a protection.
   */
  changeCapabilityProvider(
    context: Context,
    protectedRoomsSet: ProtectedRoomsSet,
    protectionDescription: ProtectionDescription,
    capabilityKey: string,
    capabilityProvider: CapabilityProviderDescription
  ): Promise<ActionResult<void>>;

  /**
   * Change the active capability provider for the protection.
   * If the protetion is enabled, it will be recreated and restarted.
   */
  changeCapabilityProviderSet(
    protectionDescription: ProtectionDescription,
    protectedRoomsSet: ProtectedRoomsSet,
    context: Context,
    capabilityProviderSet: CapabilityProviderSet
  ): Promise<ActionResult<void>>;

  /**
   * @returns The capability provider set that has been configurd for a protection.
   * @param protectionDescription The protection description to find the configured
   */
  getCapabilityProviderSet<
    TProtectionDescription extends ProtectionDescription =
      ProtectionDescription,
  >(
    protectionDescription: TProtectionDescription
  ): Promise<ActionResult<CapabilityProviderSet>>;

  getProtectionSettings<TConfigSchema extends TObject = UnknownConfig>(
    protectionDescription: ProtectionDescription
  ): Promise<ActionResult<EDStatic<TConfigSchema>>>;

  isEnabledProtection(protectionDescription: ProtectionDescription): boolean;

  /**
   * Find the named enabled protection, or return undefined if the protection
   * is disabled.
   */
  findEnabledProtection<TProtectionDescription extends ProtectionDescription>(
    name: string
  ): Protection<TProtectionDescription> | undefined;

  /**
   * Provide access to a named enabled protection
   * @param name The name of the protection.
   * @param cb Called if the protection is enabled, with the protection.
   */
  withEnabledProtection<TProtectionDescription extends ProtectionDescription>(
    name: string,
    cb: (protection: Protection<TProtectionDescription>) => void
  ): void;

  unregisterListeners(): void;
}
