// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Err, Result, ResultError } from "@gnuxie/typescript-result";
import { ParameterDescription } from "./ParameterDescription";
import { PartialCommand } from "./Command";

export class AbstractArgumentParseError extends ResultError {
  constructor(
    public readonly partialCommand: PartialCommand,
    message: string
  ) {
    super(message);
  }

  public static Result(
    message: string,
    options: { partialCommand: PartialCommand }
  ): Result<never, AbstractArgumentParseError> {
    return Err(new AbstractArgumentParseError(options.partialCommand, message));
  }
}

export class ArgumentParseError extends AbstractArgumentParseError {
  constructor(
    public readonly parameter: ParameterDescription,
    partialCommand: PartialCommand,
    message: string
  ) {
    super(partialCommand, message);
  }

  public static Result(
    message: string,
    options: {
      parameter: ParameterDescription;
      partialCommand: PartialCommand;
    }
  ): Result<never, ArgumentParseError> {
    return Err(
      new ArgumentParseError(options.parameter, options.partialCommand, message)
    );
  }
}

export class UnexpectedArgumentError extends AbstractArgumentParseError {
  public static Result<Ok>(
    message: string,
    options: { partialCommand: PartialCommand }
  ): Result<Ok, UnexpectedArgumentError> {
    return Err(new UnexpectedArgumentError(options.partialCommand, message));
  }
}

export interface PromptContext {
  items: string[];
  designator: string[];
}

export class PromptRequiredError extends ResultError {
  constructor(
    message: string,
    context: string[],
    public readonly parameterRequiringPrompt: ParameterDescription,
    public readonly partialCommand: PartialCommand
  ) {
    super(message, context);
  }

  public static Result(
    message: string,
    {
      promptParameter,
      partialCommand,
    }: {
      promptParameter: ParameterDescription;
      partialCommand: PartialCommand;
    }
  ): Result<never, PromptRequiredError> {
    return Err(
      new PromptRequiredError(message, [], promptParameter, partialCommand)
    );
  }
}
