// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { KeywordPropertyDescription } from "./KeywordParameterDescription";

export type KeywordsMeta = {
  [keyword: string]: unknown;
};

export type KeywordPropertyDescriptionsFromKeywordsMeta<
  TKeywordsMeta extends KeywordsMeta,
> = {
  [I in keyof TKeywordsMeta]: KeywordPropertyDescription<TKeywordsMeta[I]>;
};
export type KeywordPropertyRecordFromKeywordsMeta<
  TKeywordsMeta extends KeywordsMeta,
> = { [I in keyof TKeywordsMeta]?: TKeywordsMeta[I] };

export type CommandMeta<
  Context = unknown,
  InvocationInformation = unknown,
  CommandResult = unknown,
  TImmediateArgumentsObjectTypes extends unknown[] = unknown[],
  TRestArgumentObjectType = unknown,
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> = {
  readonly Context: Context;
  readonly InvocationInformation: InvocationInformation;
  readonly CommandResult: CommandResult;
  readonly TImmediateArgumentsObjectTypes: TImmediateArgumentsObjectTypes;
  readonly TRestArgumentObjectType: TRestArgumentObjectType;
  readonly TKeywordsMeta: TKeywordsMeta;
};
