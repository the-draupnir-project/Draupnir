// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import { AllocatableLifetime } from "../../Interface/Lifetime";
import { HandleRegistry } from "./HandleRegistry";

export type BivariantHandler<T extends (...args: never[]) => void> = (
  ...args: Parameters<T>
) => ReturnType<T>;

export enum HandleDataSourceType {
  /**
   * These are handles that use a plugin to derive the source data stream for
   * the handle. The handle glue code is closely associated with the plugin.
   * For example, `handleProtectionIntent` is an example of a handle that
   * takes the protection's intent projection and uses to to derive a callback.
   */
  Plugin = "plugin",
  /**
   * These are handles that use the plugin context to derive the source data
   * stream for the handle.
   */
  Context = "context",
}

export type HandleDescription<
  THandleName extends string = string,
  TPluginContext = Record<string, unknown>,
  THandleShape extends (...args: never[]) => void = (
    ...args: unknown[]
  ) => void,
> = Readonly<{
  handleName: THandleName;
  // This just gives typescript a property to destructure the shape from once
  // the handle description gets placed into a union type. Where a type parameter
  // would no longer help.
  handleShape?: BivariantHandler<THandleShape>;
}> &
  /**
   * Establish is about establishing the input to the registry which can then
   * defer to plugins. When the establishType is plugin, then the lifetime of
   * the handle is kept with the lifetime of the plugin.
   */
  (| Readonly<{
        dataSourceType: HandleDataSourceType.Context;
        establish(
          context: TPluginContext,
          publishHandleCallback: (
            handleName: THandleName,
            ...args: Parameters<THandleShape>
          ) => ReturnType<THandleShape>,
          lifetime: AllocatableLifetime<HandleRegistry>
        ): Result<void>;
      }>
    | Readonly<{
        dataSourceType: HandleDataSourceType.Plugin;
        establish<TPlugin>(
          context: TPluginContext,
          plugin: TPlugin,
          lifetime: AllocatableLifetime<TPlugin>
        ): Result<void>;
      }>
  );

export type AnyHandleDescription = HandleDescription<
  string,
  unknown,
  (...args: unknown[]) => void
>;

export function describeHandle<
  THandleName extends string = string,
  TPluginContext = Record<string, unknown>,
  THandleShape extends (...args: never[]) => void = (
    ...args: unknown[]
  ) => void,
>(
  description: HandleDescription<THandleName, TPluginContext, THandleShape>
): HandleDescription<THandleName, TPluginContext, THandleShape> {
  return description;
}

export type ExtractHandleName<THandleDescription extends HandleDescription> =
  THandleDescription extends HandleDescription<infer THandleName>
    ? THandleName
    : never;

export type ExtractHandleShape<THandleDescription extends HandleDescription> =
  THandleDescription extends { handleShape?: infer THandleShape }
    ? THandleShape
    : never;

export type PluginWithHandle<THandle extends HandleDescription> = {
  [K in ExtractHandleName<THandle>]?: ExtractHandleShape<THandle>;
};
