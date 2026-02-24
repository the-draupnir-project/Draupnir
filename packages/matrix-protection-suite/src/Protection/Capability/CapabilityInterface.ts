// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { TSchema } from "@sinclair/typebox";
import {
  CapabilityInterfaceSet,
  CapabilitySet,
  GenericCapabilityDescription,
} from "./CapabilitySet";

const CAPABILITY_INTERFACES = new Map<string, CapabilityInterfaceDescription>();

export type CapabilityInterfaceDescription = {
  name: string;
  description: string;
  schema: TSchema;
};

export function registerCapabilityInterface(
  description: CapabilityInterfaceDescription
): void {
  if (CAPABILITY_INTERFACES.has(description.name)) {
    throw new TypeError(
      `There is already an interface called ${description.name}`
    );
  }
  CAPABILITY_INTERFACES.set(description.name, description);
}

export function findCapabilityInterface(
  name: string
): CapabilityInterfaceDescription | undefined {
  return CAPABILITY_INTERFACES.get(name);
}

export function describeCapabilityInterface(
  description: CapabilityInterfaceDescription
): CapabilityInterfaceDescription {
  registerCapabilityInterface(description);
  return description;
}

export function findCapabilityInterfaceSet<
  TCapabilitySet extends CapabilitySet = CapabilitySet,
>(
  names: GenericCapabilityDescription<TCapabilitySet>
): CapabilityInterfaceSet<TCapabilitySet> {
  const set = {};
  for (const [key, name] of Object.entries(names)) {
    const capabilityInterface = findCapabilityInterface(name);
    if (capabilityInterface === undefined) {
      throw new TypeError(`Couldn't find a capability interface named ${name}`);
    }
    Object.assign(set, { [key]: capabilityInterface });
  }
  return set as CapabilityInterfaceSet<TCapabilitySet>;
}
