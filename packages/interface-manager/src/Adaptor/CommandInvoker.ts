// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Result } from "@gnuxie/typescript-result";
import { CommandMeta, CompleteCommand, PartialCommand } from "../Command";

export interface CommandInvoker<CommandInformation> {
  /**
   * Invoke the command object, running the command executor.
   */
  invoke<TCommandMeta extends CommandMeta>(
    commandContext: TCommandMeta["Context"],
    commandInformation: CommandInformation,
    command: CompleteCommand<TCommandMeta>
  ): Promise<Result<TCommandMeta["CommandResult"]>>;
  parseCommand(
    commandInformation: CommandInformation,
    partialCommand: PartialCommand
  ): Result<CompleteCommand>;
}
