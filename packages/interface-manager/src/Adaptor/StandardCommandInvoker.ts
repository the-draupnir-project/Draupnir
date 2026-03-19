// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Err, Result } from "@gnuxie/typescript-result";
import { CommandMeta, CompleteCommand, PartialCommand } from "../Command";
import { CommandInvoker } from "./CommandInvoker";
import { CommandInvokerCallbacks } from "./CommandInvokerCallbacks";
import { TextPresentationRenderer } from "../TextReader";

export class StandardCommandInvoker<
  CommandInformation,
> implements CommandInvoker<CommandInformation> {
  private readonly callbacks: CommandInvokerCallbacks<CommandInformation>;
  public constructor(callbacks: CommandInvokerCallbacks<CommandInformation>) {
    this.callbacks = callbacks;
  }
  parseCommand(
    commandInformation: CommandInformation,
    partialCommand: PartialCommand
  ): Result<CompleteCommand> {
    return partialCommand.description.parametersDescription.parse(
      partialCommand
    );
  }

  public async invoke<TCommandMeta extends CommandMeta>(
    commandContext: TCommandMeta["Context"],
    commandInformation: CommandInformation,
    command: CompleteCommand<TCommandMeta>
  ): Promise<Result<TCommandMeta["CommandResult"]>> {
    try {
      return await command.description.executor(
        commandContext as never,
        commandInformation,
        command.keywords,
        command.rest ?? [],
        ...command.immediateArguments
      );
    } catch (error) {
      if (error instanceof Error) {
        this.callbacks.commandUncaughtErrorCB?.(
          commandInformation,
          command
            .toPartialCommand()
            .stream.source.map((p) => TextPresentationRenderer.render(p))
            .join(" "),
          error
        );
        if (this.callbacks.convertUncaughtErrorToResultError) {
          return Err(this.callbacks.convertUncaughtErrorToResultError(error));
        } else {
          throw new TypeError(
            `Caught an error when executing a command, please use convertUncaughtErrorToResultError to handle this error and extract information from it.`
          );
        }
      } else {
        throw new TypeError(
          // I don't know what else we're going to do with it...
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Something is throwing things that are not errors ${error})}`
        );
      }
    }
  }
}
