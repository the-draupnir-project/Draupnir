// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  CommandDescription,
  CommandTable,
  PartialCommand,
  makePartialCommand,
} from "../Command";
import {
  PresentationArgumentStream,
  StandardPresentationArgumentStream,
} from "../Command/PresentationStream";
import { CommandDispatcher, CommandDispatcherCallbacks } from "../Adaptor";
import { Err, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { readCommand } from "./TextCommandReader";

export class StandardCommandDispatcher<
  BasicInvocationInformation,
> implements CommandDispatcher<BasicInvocationInformation> {
  public constructor(
    private readonly commandTable: CommandTable,
    private readonly helpCommand: CommandDescription,
    private readonly callbacks: CommandDispatcherCallbacks<BasicInvocationInformation>
  ) {
    // nothing to do.
  }
  parsePartialCommandFromBody(
    commandInformation: BasicInvocationInformation,
    body: string
  ): Result<PartialCommand> {
    // The try is required because readCommand does not return `Result`s and throws errors.
    try {
      const normalisedCommandBody = this.callbacks.commandNormaliser(body);
      if (normalisedCommandBody === undefined) {
        return ResultError.Result("No command found in the body.");
      }
      const readResult = readCommand(normalisedCommandBody);
      const firstItem = readResult.at(0);
      if (firstItem === undefined || typeof firstItem.object !== "string") {
        return ResultError.Result("No command found in the body.");
      }
      return this.parsePartialCommandFromStream(
        commandInformation,
        new StandardPresentationArgumentStream(readResult)
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.callbacks.commandUncaughtErrorCB?.(
          commandInformation,
          body,
          error
        );
        if (this.callbacks.convertUncaughtErrorToResultError) {
          return Err(this.callbacks.convertUncaughtErrorToResultError(error));
        } else {
          throw new TypeError(
            `Caught an error when parsing a command, please use convertUncaughtErrorToResultError to handle this error and extract information from it.`
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

  parsePartialCommandFromStream(
    commandInformation: BasicInvocationInformation,
    stream: PresentationArgumentStream
  ): Result<PartialCommand> {
    this.callbacks.logCurrentCommandCB?.(commandInformation, stream.source);
    const commandToUse =
      this.commandTable.findAMatchingCommand(stream) ?? this.helpCommand;
    const normalisedDesignator = stream.source
      .slice(0, stream.getPosition())
      .map((p) => p.object) as string[];
    const partialCommand = makePartialCommand(
      stream,
      commandToUse,
      this.commandTable,
      normalisedDesignator
    );
    return Ok(partialCommand);
  }
}
