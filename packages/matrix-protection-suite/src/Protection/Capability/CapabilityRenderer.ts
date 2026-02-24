// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DescriptionMeta } from "../DescriptionMeta";
import { findCapabilityContextGlue } from "./CapabilityContextGlue";
import { findCapabilityInterface } from "./CapabilityInterface";
import {
  Capability,
  CapabilityProviderDescription,
} from "./CapabilityProvider";

export interface CapabilityRendererDescription<
  TCapabilityInterface = unknown,
  Context = unknown,
> extends Omit<CapabilityProviderDescription<Context>, "factory"> {
  factory(
    protectionDescription: DescriptionMeta,
    context: Context,
    provider: TCapabilityInterface
  ): Capability;
  isDefaultForInterface?: true;
}

const RENDERER_DESCRIPTIONS = new Map<string, CapabilityRendererDescription>();
const DEFAULT_RENDERER_FOR_INTERFACE = new Map<
  string,
  CapabilityRendererDescription
>();

export function registerCapabilityRenderer(
  description: CapabilityRendererDescription
): void {
  if (RENDERER_DESCRIPTIONS.has(description.name)) {
    throw new TypeError(
      `There is already a capability renderer named ${description.name}`
    );
  }
  if (description.isDefaultForInterface) {
    if (DEFAULT_RENDERER_FOR_INTERFACE.has(description.interface.name)) {
      throw new TypeError(
        `There is already a renderer for the capability interface ${description.interface.name}`
      );
    }
    DEFAULT_RENDERER_FOR_INTERFACE.set(description.interface.name, description);
  }
  RENDERER_DESCRIPTIONS.set(description.name, description);
}

export function findCapabilityRenderer<
  TCapabilityInterface = unknown,
  Context = unknown,
>(
  name: string
): CapabilityRendererDescription<TCapabilityInterface, Context> | undefined {
  return RENDERER_DESCRIPTIONS.get(name);
}

export function describeCapabilityRenderer<
  TCapabilityInterface = unknown,
  Context = unknown,
>({
  name,
  description,
  interface: interfaceName,
  factory,
  isDefaultForInterface,
}: {
  name: string;
  description: string;
  interface: string;
  factory: CapabilityRendererDescription<
    TCapabilityInterface,
    Context
  >["factory"];
  isDefaultForInterface?: true;
}): void {
  const entry = findCapabilityInterface(interfaceName);
  if (entry === undefined) {
    throw new TypeError(
      `Cannot find a CapabilityInterface named ${interfaceName}`
    );
  }
  registerCapabilityRenderer({
    ...(isDefaultForInterface ? { isDefaultForInterface } : {}),
    name,
    description,
    interface: entry,
    factory,
  });
}

function findRendererForInterface(
  interfaceName: string
): CapabilityRendererDescription | undefined {
  return DEFAULT_RENDERER_FOR_INTERFACE.get(interfaceName);
}

export function wrapCapabilityProviderInRenderer<Context = unknown>(
  protectionDescription: DescriptionMeta,
  context: Context,
  capabilityProviderDescription: CapabilityProviderDescription<Context>
): Capability {
  const rendererDescription =
    findCapabilityRenderer(capabilityProviderDescription.name) ??
    findRendererForInterface(capabilityProviderDescription.interface.name);
  if (rendererDescription === undefined) {
    throw new TypeError(
      `Cannot find a renderer for the capability provider named ${capabilityProviderDescription.name}`
    );
  }
  const glue = findCapabilityContextGlue(capabilityProviderDescription.name);
  const capabilityProvider =
    glue === undefined
      ? capabilityProviderDescription.factory(protectionDescription, context)
      : glue.glueMethod(
          protectionDescription,
          context,
          capabilityProviderDescription
        );
  return rendererDescription.factory(
    protectionDescription,
    context,
    capabilityProvider
  );
}
