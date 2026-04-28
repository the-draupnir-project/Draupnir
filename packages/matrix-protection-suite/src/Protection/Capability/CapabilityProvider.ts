// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Type } from "@sinclair/typebox";
import { DescriptionMeta } from "../DescriptionMeta";
import {
  CapabilityInterfaceDescription,
  findCapabilityInterface,
} from "./CapabilityInterface";
import {
  CapabilityProviderSet,
  CapabilitySet,
  GenericCapabilityDescription,
} from "./CapabilitySet";
import { PowerLevelPermission } from "../../Client/PowerLevelsMirror";

/**
 * We don't want to give protections access to the capability provider
 * description, just in case they do something silly.
 */
export interface CapabilityProviderDescription<Context = unknown> {
  /** Used by the user to identify the description */
  name: string;
  description: string;
  interface: CapabilityInterfaceDescription;
  isSimulated?: true;
  /**
   * Returns an instance of the provider.
   * @param protectionDescription A description of the protection that we are making the provider for.
   * Mostly so that the capability provider can audit the protection.
   * @param context Anything used to create the capability, usually the ProtectedRoomsSet context,
   * like Draupnir.
   */
  factory(protectionDescription: DescriptionMeta, context: Context): Capability;
}

export interface Capability {
  readonly requiredPermissions: PowerLevelPermission[];
  readonly requiredStatePermissions: string[];
  readonly requiredEventPermissions: string[];
  readonly isSimulated?: boolean;
}

export const Capability = Type.Object({
  requiredPermissions: Type.Array(Type.String()),
  requiredEventPermissions: Type.Array(Type.String()),
  requiredStatePermissions: Type.Array(Type.String()),
});

const PROVIDER_DESCRIPTIONS = new Map<string, CapabilityProviderDescription>();
const PROVIDER_DESCRIPTIONS_FOR_INTERFACE = new Map<
  string,
  CapabilityProviderDescription[]
>();

const SIMULATED_CAPABILITY_PROVIDERS = new Map<
  string,
  CapabilityProviderDescription
>();

export function registerCapabilityProvider(
  description: CapabilityProviderDescription
): void {
  if (PROVIDER_DESCRIPTIONS.has(description.name)) {
    throw new TypeError(
      `There is already a consequence provider named ${description.name}`
    );
  }
  if (description.isSimulated) {
    if (SIMULATED_CAPABILITY_PROVIDERS.has(description.interface.name)) {
      throw new TypeError(
        `There is already a simualted capability provider for the ${description.interface.name} interface`
      );
    }
    SIMULATED_CAPABILITY_PROVIDERS.set(description.interface.name, description);
  }
  PROVIDER_DESCRIPTIONS.set(description.name, description);
  PROVIDER_DESCRIPTIONS_FOR_INTERFACE.set(description.interface.name, [
    ...(PROVIDER_DESCRIPTIONS_FOR_INTERFACE.get(description.interface.name) ??
      []),
    description,
  ]);
}

export function findCapabilityProvider<Context = unknown>(
  name: string
): CapabilityProviderDescription<Context> | undefined {
  return PROVIDER_DESCRIPTIONS.get(name);
}

export function describeCapabilityProvider<Context = unknown>({
  name,
  description,
  interface: interfaceName,
  isSimulated,
  factory,
}: {
  name: string;
  description: string;
  interface: string;
  isSimulated?: boolean;
  factory: (
    this: unknown,
    description: DescriptionMeta,
    context: Context
  ) => Capability;
}): void {
  const entry = findCapabilityInterface(interfaceName);
  if (entry === undefined) {
    throw new TypeError(
      `Cannot find a CapabilityInterface named ${interfaceName}`
    );
  }
  registerCapabilityProvider({
    name,
    description,
    interface: entry,
    ...(isSimulated ? { isSimulated } : {}),
    factory,
  });
}

export function findCapabilityProviderSet<
  TCapabilitySet extends CapabilitySet = CapabilitySet,
>(
  names: GenericCapabilityDescription<TCapabilitySet>
): CapabilityProviderSet<TCapabilitySet> {
  const set = {};
  for (const [key, name] of Object.entries(names)) {
    const capabilityProvider = findCapabilityProvider(name);
    if (capabilityProvider === undefined) {
      throw new TypeError(`Couldn't find a capability provider named ${name}`);
    }
    Object.assign(set, { [key]: capabilityProvider });
  }
  return set as CapabilityProviderSet<TCapabilitySet>;
}

export function findCompatibleCapabilityProviders(
  interfaceName: string
): CapabilityProviderDescription[] {
  return PROVIDER_DESCRIPTIONS_FOR_INTERFACE.get(interfaceName) ?? [];
}

export function findSimulatedCapabilityProvider(
  interfaceName: string
): CapabilityProviderDescription | undefined {
  return SIMULATED_CAPABILITY_PROVIDERS.get(interfaceName);
}
