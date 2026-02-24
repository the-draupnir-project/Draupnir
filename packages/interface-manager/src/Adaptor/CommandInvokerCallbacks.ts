// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { ResultError } from "@gnuxie/typescript-result";
import { Command } from "../Command";

export type CommandFailedCB<CommandInformation> = (
  commandInfo: CommandInformation,
  command: Command,
  error: ResultError
) => void;

export type CommandUncaughtErrorCB<CommandInformation> = (
  commandInformation: CommandInformation,
  commandBody: string,
  error: Error
) => void;
export type ConvertUncaughtErrorToResultError = (error: Error) => ResultError;

export interface CommandInvokerCallbacks<CommandInformation> {
  /**
   * A callback to handle commands returning an error result.
   * Used for logging usually.
   */
  readonly commandFailedCB?: CommandFailedCB<CommandInformation> | undefined;
  /**
   * A callback to handle any uncaught JS `Error`s that were thrown
   * while handling a command.
   */
  readonly commandUncaughtErrorCB?:
    | CommandUncaughtErrorCB<CommandInformation>
    | undefined;
  readonly convertUncaughtErrorToResultError?:
    | ConvertUncaughtErrorToResultError
    | undefined;
}
