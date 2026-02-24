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

import { Result } from "@gnuxie/typescript-result";
import { ParsedKeywords } from "./ParsedKeywords";
import { CommandMeta } from "./CommandMeta";
import { CommandParametersDescription } from "./ParameterParsing";

export type CommandExecutorFunction<TCommandMeta extends CommandMeta> = (
  // The context needs to be specific to each command, and we need to add context glue
  // that can attenuate them.
  context: unknown extends TCommandMeta["Context"]
    ? never
    : TCommandMeta["Context"],
  invocationInformation: TCommandMeta["InvocationInformation"],
  keywords: ParsedKeywords,
  rest: TCommandMeta["TRestArgumentObjectType"][],
  ...args: TCommandMeta["TImmediateArgumentsObjectTypes"]
) => Promise<Result<TCommandMeta["CommandResult"]>>;

export interface CommandDescription<
  TCommandMeta extends CommandMeta = CommandMeta,
> {
  readonly executor: CommandExecutorFunction<TCommandMeta>;
  /** A short one line summary of what the command does to display alongside it's help */
  readonly summary: string;
  /** A longer description that goes into detail. */
  readonly description?: string | undefined;
  readonly parametersDescription: CommandParametersDescription<
    TCommandMeta["TImmediateArgumentsObjectTypes"],
    TCommandMeta["TRestArgumentObjectType"],
    TCommandMeta["TKeywordsMeta"]
  >;
}

export type ExtractCommandMeta<TCommandDescription> =
  TCommandDescription extends CommandDescription<infer TCommandMeta>
    ? TCommandMeta
    : never;
