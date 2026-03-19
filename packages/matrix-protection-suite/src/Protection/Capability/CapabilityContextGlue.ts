// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DescriptionMeta } from "../DescriptionMeta";
import {
  Capability,
  CapabilityProviderDescription,
  findCapabilityProvider,
} from "./CapabilityProvider";

const CAPABILITY_CONTEXT_GLUE = new Map<string, CapabilityContextGlue>();

/**
 * This is used to destructure contexts for capability providers that are
 * written for contexts that they don't understand.
 * For example, we provide standard capabilities in this library,
 * which won't be aware of the contexts that they eventually get used in.
 * Therefore, a client has to implement glue to destructure that context
 * for them.
 */
export type CapabilityContextGlue<
  HostContext = unknown,
  GuestContext = unknown,
> = {
  /** The name of the capability provider to provide glue for */
  name: string;
  glueMethod: (
    protectionDescription: DescriptionMeta,
    context: HostContext,
    capabilityProvider: CapabilityProviderDescription<GuestContext>
  ) => Capability;
};

export function findCapabilityContextGlue(
  name: string
): CapabilityContextGlue | undefined {
  return CAPABILITY_CONTEXT_GLUE.get(name);
}

export function registerCapabilityContextGlue<
  HostContext = unknown,
  GuestContext = unknown,
>(glue: CapabilityContextGlue<HostContext, GuestContext>): void {
  const capabilityWithName = findCapabilityProvider(glue.name);
  if (capabilityWithName === undefined) {
    throw new TypeError(
      `Cannot find a capability provider for the glue named ${glue.name}`
    );
  }
  CAPABILITY_CONTEXT_GLUE.set(glue.name, glue as CapabilityContextGlue);
}

export function describeCapabilityContextGlue<
  HostContext = unknown,
  GuestContext = unknown,
>(glue: CapabilityContextGlue<HostContext, GuestContext>): void {
  registerCapabilityContextGlue<HostContext, GuestContext>(glue);
}
