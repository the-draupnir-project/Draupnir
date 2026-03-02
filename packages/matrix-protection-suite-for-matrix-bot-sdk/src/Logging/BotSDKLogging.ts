// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { LogService } from "@vector-im/matrix-bot-sdk";
import { ILoggerProvider } from "matrix-protection-suite";

/**
 * A logger provider that uses the `LogService` from the bot-sdk to provide logging capability.
 * @see {@link setGlobalLoggerProvider}
 */
export class BotSDKLogServiceLogger implements ILoggerProvider {
  debug(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.debug(moduleName, message, ...parts);
  }
  info(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.info(moduleName, message, ...parts);
  }
  warn(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.warn(moduleName, message, ...parts);
  }
  error(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.error(moduleName, message, ...parts);
  }
}
