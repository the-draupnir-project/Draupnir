// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { CommandDescription } from "./CommandDescription";
import { CommandMeta } from "./CommandMeta";
import { CommandTable } from "./CommandTable";
import { ParsedKeywords } from "./ParsedKeywords";
import { PresentationArgumentStream } from "./PresentationStream";

type CommandBase<TCommandMeta extends CommandMeta = CommandMeta> = {
  readonly description: CommandDescription<TCommandMeta>;
  // The normalised designator that was used to invoke the command.
  readonly designator: string[];
  readonly commandTable: CommandTable;
};

export type Command<TCommandMeta extends CommandMeta = CommandMeta> =
  | CompleteCommand<TCommandMeta>
  | PartialCommand<TCommandMeta>;

export type CompleteCommand<TCommandMeta extends CommandMeta = CommandMeta> =
  CommandBase<TCommandMeta> & {
    readonly isPartial: false;
    readonly immediateArguments: TCommandMeta["TImmediateArgumentsObjectTypes"];
    readonly rest?: TCommandMeta["TRestArgumentObjectType"][];
    readonly keywords: ParsedKeywords;
    toPartialCommand(): PartialCommand;
  };

export type PartialCommand<TCommandMeta extends CommandMeta = CommandMeta> =
  CommandBase<TCommandMeta> & {
    readonly isPartial: true;
    readonly stream: PresentationArgumentStream;
  };

export function isPartialCommand(command: Command): command is PartialCommand {
  return command.isPartial;
}

export function isCompleteCommand<
  TCommandMeta extends CommandMeta = CommandMeta,
>(command: Command<TCommandMeta>): command is CompleteCommand<TCommandMeta> {
  return !command.isPartial;
}

export function makePartialCommand<
  TCommandMeta extends CommandMeta = CommandMeta,
>(
  stream: PresentationArgumentStream,
  commandDescription: CommandDescription<TCommandMeta>,
  commandTable: CommandTable,
  designator: string[]
): PartialCommand<TCommandMeta> {
  return {
    stream,
    isPartial: true,
    description: commandDescription,
    designator,
    commandTable,
  };
}
