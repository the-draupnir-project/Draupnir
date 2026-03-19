// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { PowerLevelPermission } from "../../Client/PowerLevelsMirror";
import { DescriptionMeta } from "../DescriptionMeta";
import { CapabilityInterfaceDescription } from "./CapabilityInterface";
import {
  Capability,
  CapabilityProviderDescription,
} from "./CapabilityProvider";
import { wrapCapabilityProviderInRenderer } from "./CapabilityRenderer";

export type CapabilityInterfaceSet<
  TCapabilitySet extends CapabilitySet = CapabilitySet,
> = Record<keyof TCapabilitySet, CapabilityInterfaceDescription>;

export type CapabilityProviderSet<
  TCapabilitySet extends CapabilitySet = CapabilitySet,
> = Record<keyof TCapabilitySet, CapabilityProviderDescription>;

export type CapabilitySet<Names extends string = string> = Record<
  Names,
  Capability
>;

export type GenericCapabilityDescription<
  TCapabilitySet extends CapabilitySet = CapabilitySet,
> = Record<keyof TCapabilitySet, string>;

export function initializeCapabilitySet<Context = unknown>(
  protectionDescription: DescriptionMeta,
  capabilityDescriptions: CapabilityProviderSet,
  context: Context
): CapabilitySet {
  const set = {};
  for (const [name, description] of Object.entries(capabilityDescriptions)) {
    Object.assign(set, {
      [name]: wrapCapabilityProviderInRenderer(
        protectionDescription,
        context,
        description
      ),
    });
  }
  return set;
}

export function capabilitySetEventPermissions(set: CapabilitySet): string[] {
  return Object.entries(set).reduce<string[]>(
    (acc, [_name, capability]) => [
      ...acc,
      ...capability.requiredEventPermissions,
    ],
    []
  );
}

export function capabilitySetPermissions(
  set: CapabilitySet
): PowerLevelPermission[] {
  return Object.entries(set).reduce<PowerLevelPermission[]>(
    (acc, [_name, capability]) => [...acc, ...capability.requiredPermissions],
    []
  );
}

export function capabilitySetStatePermissions(set: CapabilitySet): string[] {
  return Object.entries(set).reduce<string[]>(
    (acc, [_name, capability]) => [
      ...acc,
      ...capability.requiredStatePermissions,
    ],
    []
  );
}
