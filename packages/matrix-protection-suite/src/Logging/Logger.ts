// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-appservice-bridge
// https://github.com/matrix-org/matrix-appservice-bridge
// </text>

/**
 * An interface for any object that provides a logging capability.
 * @see {@link setGlobalLoggerProvider}.
 */
export interface ILoggerProvider {
  debug(moduleName: string, message: string, ...parts: unknown[]): void;
  info(moduleName: string, message: string, ...parts: unknown[]): void;
  warn(moduleName: string, message: string, ...parts: unknown[]): void;
  error(moduleName: string, message: string, ...parts: unknown[]): void;
}

/**
 * A logger provider that uses the `console` object to provide logging capability.
 * Intended only as a default that should be replaced by any client of this library.
 * @see {@link setGlobalLoggerProvider}
 */
class DumbConsoleLogger implements ILoggerProvider {
  debug(...parts: unknown[]): void {
    console.debug(...parts);
  }
  info(...parts: unknown[]): void {
    console.info(...parts);
  }
  warn(...parts: unknown[]): void {
    console.warn(...parts);
  }
  error(...parts: unknown[]): void {
    console.error(...parts);
  }
}

let globalLoggerProvider = new DumbConsoleLogger();

/**
 * This is a utility used throughout the library to provide generic logging
 * capability without being tied to one provider or logging implementation.
 * @see {@link setGlobalLoggerProvider}
 */
export class Logger implements ILoggerProvider {
  constructor(public readonly moduleName: string) {}

  public debug(message: string, ...parts: unknown[]): void {
    globalLoggerProvider.debug(this.moduleName, message, ...parts);
  }

  public info(message: string, ...parts: unknown[]): void {
    globalLoggerProvider.info(this.moduleName, message, ...parts);
  }

  public warn(message: string, ...parts: unknown[]): void {
    globalLoggerProvider.warn(this.moduleName, message, ...parts);
  }

  public error(message: string, ...parts: unknown[]): void {
    globalLoggerProvider.error(this.moduleName, message, ...parts);
  }
}

/**
 * Allows the provider for all instances of `Logger` to be set.
 * @param provider An object that implements `ILoggerProvider`.
 * @see {@link ILoggerProvider}.
 */
export function setGlobalLoggerProvider(provider: ILoggerProvider): void {
  globalLoggerProvider = provider;
}
