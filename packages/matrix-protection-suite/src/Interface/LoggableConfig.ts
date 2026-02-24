// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

export interface LoggableConfig {
  logCurrentConfig(): void;
}

export interface LoggableConfigTracker extends LoggableConfig {
  addLoggableConfig(config: LoggableConfig): void;
  removeLoggableConfig(config: LoggableConfig): void;
}

export class StandardLoggableConfigTracker implements LoggableConfigTracker {
  private readonly loggables = new Set<LoggableConfig>();
  addLoggableConfig(config: LoggableConfig): void {
    this.loggables.add(config);
  }
  removeLoggableConfig(config: LoggableConfig): void {
    this.loggables.delete(config);
  }
  logCurrentConfig(): void {
    for (const loggable of this.loggables) {
      loggable.logCurrentConfig();
    }
  }
}
