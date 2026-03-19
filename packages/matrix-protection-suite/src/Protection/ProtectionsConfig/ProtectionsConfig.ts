// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionResult } from "../../Interface/Action";
import { LoggableConfig } from "../../Interface/LoggableConfig";
import { ProtectionDescription } from "../Protection";

export type ProtectionsInfo = {
  knownEnabledProtections: ProtectionDescription[];
  /** protection names that have no matching description */
  unknownEnabledProtections: string[];
};

/**
 * The original ProtectionsConfig needed breaking up because it did too much.
 * The old ProtectionsConfig would not only provide a model for accessing
 * instantiated protections for calling their handles with, but would also
 * manage writing back their state.
 *
 * So we're just going to focus on writing back and reading state
 * without instantiating protections themselves.
 *
 * We're also trying something new, with the `logCurrentConfig` method,
 * which is intended to be used to log the real value of the config in the event
 * that there is a fatal validation error or something similar.
 *
 * Settings should be loaded with yet another distinct config provider.
 */
export interface ProtectionsConfig extends LoggableConfig {
  enableProtection(
    protectionDescription: ProtectionDescription
  ): Promise<ActionResult<void>>;
  disableProtection(protectionName: string): Promise<ActionResult<void>>;
  getKnownEnabledProtections(): ProtectionDescription[];
  /**
   * Return the names of any enabled protections for which a description
   * cannot be found.
   */
  getUnknownEnabledProtections(): string[];
}
