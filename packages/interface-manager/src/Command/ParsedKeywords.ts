// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { KeywordsMeta } from "./CommandMeta";
import { KeywordParametersDescription } from "./KeywordParameterDescription";
import { Presentation } from "./Presentation";

export interface ParsedKeywords {
  getKeywordValue<ObjectType = unknown>(
    keyword: string,
    defaultValue?: ObjectType
  ): ObjectType | undefined;
}

/**
 * A read only map of keywords to their associated properties.
 */
export class StandardParsedKeywords<
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> implements ParsedKeywords {
  constructor(
    private readonly description: KeywordParametersDescription<TKeywordsMeta>,
    private readonly keywords: ReadonlyMap<
      keyof TKeywordsMeta,
      Presentation | true
    >
  ) {}

  public getKeywordValue<ObjectType = unknown>(
    keyword: string,
    defaultValue: ObjectType | undefined
  ): ObjectType | undefined {
    const keywordDescription = this.description.keywordDescriptions[keyword];
    if (keywordDescription === undefined) {
      throw new TypeError(
        `${keyword} is not a keyword that has been described for this command.`
      );
    }
    const value = this.keywords.get(keyword);
    if (value === true) {
      return value as ObjectType;
    } else if (value !== undefined) {
      return value.object as ObjectType;
    } else {
      return defaultValue;
    }
  }
}

export class DirectParsedKeywords<
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> implements ParsedKeywords {
  constructor(
    private readonly description: KeywordParametersDescription<TKeywordsMeta>,
    public readonly keywords: TKeywordsMeta
  ) {
    // nothing to do.
  }

  public getKeywordValue<ObjectType = unknown>(
    keyword: string,
    defaultValue?: ObjectType
  ): ObjectType | undefined {
    const keywordDescription = this.description.keywordDescriptions[keyword];
    if (keywordDescription === undefined) {
      throw new TypeError(
        `${keyword} is not a keyword that has been described for this command.`
      );
    }
    const value = this.keywords[keyword];
    if (value === undefined) {
      return defaultValue;
    } else {
      return value as ObjectType;
    }
  }
}
