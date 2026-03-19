// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Result, isError } from "@gnuxie/typescript-result";
import { CommandDescription } from "./CommandDescription";
import { CommandMeta, KeywordsMeta } from "./CommandMeta";
import { DirectParsedKeywords } from "./ParsedKeywords";
import { StandardCommandInvoker } from "../Adaptor";
import { PartialCommand } from "./Command";
import { StandardPresentationArgumentStream } from "./PresentationStream";
import { Presentation } from "./Presentation";
import { KeywordPresentationType } from "../TextReader";
import { Keyword } from "./Keyword";
import { CommandTable } from "./CommandTable";

export type CommandExecutorHelperOptions<
  TInvocationInformation,
  TRestArgumentObjectType,
  TKeywordsMeta extends KeywordsMeta,
> = {
  info?: TInvocationInformation | undefined;
  rest?: TRestArgumentObjectType[] | undefined;
  keywords?: Partial<TKeywordsMeta> | undefined;
};

type CommandExecutorHelperParseOptions<
  TInvocationInformation,
  TRestArgumentObjectType,
  TKeywordsMeta extends KeywordsMeta,
> = {
  info?: TInvocationInformation | undefined;
  rest?: Presentation<TRestArgumentObjectType>[] | undefined;
  keywords?:
    | Partial<{ [I in keyof TKeywordsMeta]: Presentation<TKeywordsMeta[I]> }>
    | undefined;
};

export const CommandExecutorHelper = Object.freeze({
  async execute<
    TCommandContext,
    TInvocationInformation,
    TCommandResult,
    TImmediateArgumentsObjectTypes extends unknown[],
    TRestArgumentObjectType,
    TKeywordsMeta extends KeywordsMeta,
  >(
    command: CommandDescription<
      CommandMeta<
        TCommandContext,
        TInvocationInformation,
        TCommandResult,
        TImmediateArgumentsObjectTypes,
        TRestArgumentObjectType,
        TKeywordsMeta
      >
    >,
    context: TCommandContext,
    options: CommandExecutorHelperOptions<
      TInvocationInformation,
      TRestArgumentObjectType,
      TKeywordsMeta
    >,
    ...args: TImmediateArgumentsObjectTypes
  ): Promise<Result<TCommandResult>> {
    const parsedKeywords = new DirectParsedKeywords(
      command.parametersDescription.keywords,
      options.keywords ?? {}
    );
    return await command.executor(
      context as never,
      options.info ?? ({} as TInvocationInformation),
      parsedKeywords,
      options.rest ?? [],
      ...args
    );
  },
  async parseAndInvoke<
    TCommandContext,
    TInvocationInformation,
    TCommandResult,
    TImmediateArgumentsObjectTypes extends unknown[],
    TRestArgumentObjectType,
    TKeywordsMeta extends KeywordsMeta,
  >(
    commandTable: CommandTable,
    command: CommandDescription<
      CommandMeta<
        TCommandContext,
        TInvocationInformation,
        TCommandResult,
        TImmediateArgumentsObjectTypes,
        TRestArgumentObjectType,
        TKeywordsMeta
      >
    >,
    context: TCommandContext,
    options: CommandExecutorHelperParseOptions<
      TInvocationInformation,
      TRestArgumentObjectType,
      TKeywordsMeta
    >,
    ...args: {
      [I in keyof TImmediateArgumentsObjectTypes]:
        | Presentation<TImmediateArgumentsObjectTypes[I]>
        | undefined;
    }
  ): Promise<Result<TCommandResult>> {
    type TPartialCommand = PartialCommand<
      CommandMeta<
        TCommandContext,
        TInvocationInformation,
        TCommandResult,
        TImmediateArgumentsObjectTypes,
        TRestArgumentObjectType,
        TKeywordsMeta
      >
    >;
    const commandInvoker = new StandardCommandInvoker({});
    const flatKeywords: Presentation[] = [];
    for (const [key, value] of Object.entries(options.keywords ?? {})) {
      flatKeywords.push(KeywordPresentationType.wrap(new Keyword(key)));
      flatKeywords.push(value as Presentation);
    }
    const partialcommand = {
      description: command,
      designator: ["CommandExecutorHelper"],
      isPartial: true,
      stream: new StandardPresentationArgumentStream([
        ...args.reduce<Presentation[]>(
          (acc, arg) => (arg ? [...acc, arg] : acc),
          []
        ),
        ...flatKeywords,
        ...(options.rest ?? []),
      ]),
      commandTable,
    } satisfies TPartialCommand;
    const parseResult = commandInvoker.parseCommand(
      options.info,
      partialcommand as never
    );
    if (isError(parseResult)) {
      return parseResult;
    } else {
      return (await commandInvoker.invoke(
        context,
        options.info,
        parseResult.ok
      )) as Result<TCommandResult>;
    }
  },
});
