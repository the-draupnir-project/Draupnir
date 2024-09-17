// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import { Draupnir } from "../Draupnir";
import { SafeModeDraupnir } from "./DraupnirSafeMode";
import { SafeModeCause } from "./SafeModeCause";

export interface SafeModeToggle {
  /**
   * Switch the bot to Draupnir mode.
   * We expect that the result represents the entire conversion.
   * We expect that the same matrix client is shared between the bots.
   * That means that by the command responds with ticks and crosses,
   * draupnir will be running or we will still be in safe mode.
   */
  switchToDraupnir(): Promise<Result<Draupnir>>;
  switchToSafeMode(cause: SafeModeCause): Promise<Result<SafeModeDraupnir>>;
}
