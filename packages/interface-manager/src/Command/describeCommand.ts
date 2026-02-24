// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  CommandDescription,
  CommandExecutorFunction,
} from "./CommandDescription";
import { CommandMeta, KeywordsMeta } from "./CommandMeta";
import {
  DescribeCommandParametersOptions,
  describeCommandParameters,
} from "./ParameterParsing";

export type DescribeCommandOptions<TCommandMeta extends CommandMeta> = {
  /** A short one line summary of what the command does to display alongside it's help */
  readonly summary: string;
  /** A longer description that goes into detail. */
  readonly description?: string;
  readonly executor: CommandExecutorFunction<TCommandMeta>;
} & DescribeCommandParametersOptions<
  TCommandMeta["TImmediateArgumentsObjectTypes"],
  TCommandMeta["TRestArgumentObjectType"],
  TCommandMeta["TKeywordsMeta"]
>;

export function describeCommand<
  Context = unknown,
  InvocationInformation = unknown,
  CommandResult = unknown,
  TImmediateArgumentsObjectTypes extends unknown[] = unknown[],
  TRestArgumentObjectType = unknown,
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
>(
  options: DescribeCommandOptions<
    CommandMeta<
      Context,
      InvocationInformation,
      CommandResult,
      TImmediateArgumentsObjectTypes,
      TRestArgumentObjectType,
      TKeywordsMeta
    >
  >
): CommandDescription<
  CommandMeta<
    Context,
    InvocationInformation,
    CommandResult,
    TImmediateArgumentsObjectTypes,
    TRestArgumentObjectType,
    TKeywordsMeta
  >
> {
  const parametersDescription = describeCommandParameters<
    TImmediateArgumentsObjectTypes,
    TRestArgumentObjectType,
    TKeywordsMeta
  >({
    parameters: options.parameters,
    rest: options.rest,
    keywords: options.keywords,
  });
  return {
    summary: options.summary,
    description: options.description,
    executor: options.executor,
    parametersDescription,
  };
}
