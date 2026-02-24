// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Result, Ok, isError, getOwn } from "@gnuxie/typescript-result";
import { TextPresentationRenderer } from "../TextReader/TextPresentationRenderer";
import { Keyword } from "./Keyword";
import { ParameterDescription } from "./ParameterDescription";
import { ArgumentParseError, UnexpectedArgumentError } from "./ParseErrors";
import { ParsedKeywords, StandardParsedKeywords } from "./ParsedKeywords";
import { Presentation, PresentationTypeWithoutWrap } from "./Presentation";
import { RestDescription } from "./RestParameterDescription";
import { PartialCommand } from "./Command";
import {
  PresentationSchema,
  PresentationSchemaType,
  SinglePresentationSchema,
  TopPresentationSchema,
  acceptPresentation,
  printPresentationSchema,
} from "./PresentationSchema";
import {
  KeywordPropertyDescriptionsFromKeywordsMeta,
  KeywordsMeta,
} from "./CommandMeta";

/**
 * An extension of ParameterDescription, some keyword arguments
 * may just be flags that have no associated property in syntax,
 * and their presence is to associate the value `true`.
 */
export interface KeywordPropertyDescription<
  ObjectType = unknown,
> extends ParameterDescription<ObjectType> {
  readonly isFlag: boolean;
}

export interface DescribeKeywordProperty<ObjectType = unknown> {
  readonly acceptor?:
    | PresentationSchema<ObjectType>
    | PresentationTypeWithoutWrap<ObjectType>;
  readonly isFlag?: boolean;
  readonly description?: string;
}

/**
 * Describes which keyword arguments can be accepted by a command.
 */
export interface KeywordParametersDescription<
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> {
  readonly keywordDescriptions: KeywordPropertyDescriptionsFromKeywordsMeta<TKeywordsMeta>;
  readonly allowOtherKeys?: boolean;
  getParser(): KeywordParser;
}

/**
 * A helper that gets instantiated for each command invoccation to parse and build
 * the map representing the association between keywords and their properties.
 */
export class KeywordParser<TKeywordsMeta extends KeywordsMeta = KeywordsMeta> {
  private readonly arguments = new Map<
    keyof KeywordsMeta,
    Presentation | true
  >();

  constructor(
    public readonly description: KeywordParametersDescription<TKeywordsMeta>
  ) {}

  public getKeywords(): ParsedKeywords {
    return new StandardParsedKeywords<TKeywordsMeta>(
      this.description,
      this.arguments
    );
  }

  private readKeywordAssociatedProperty<
    TKeywordPropertyDescription extends
      KeywordParametersDescription["keywordDescriptions"][string],
  >(
    keyword: TKeywordPropertyDescription,
    partialCommand: PartialCommand
  ): Result<Presentation | true, ArgumentParseError> {
    const stream = partialCommand.stream;
    const nextItem = stream.peekItem();
    if (nextItem !== undefined && !(nextItem.object instanceof Keyword)) {
      const acceptedPresentation = acceptPresentation(
        keyword.acceptor,
        partialCommand.commandTable,
        nextItem
      );
      if (acceptedPresentation !== undefined) {
        stream.readItem(); // consume the presentation from the stream.
        return Ok(acceptedPresentation);
      } else {
        return ArgumentParseError.Result(
          `Was expecting a match for the presentation type: ${printPresentationSchema(keyword.acceptor)} but got ${TextPresentationRenderer.render(nextItem)}.`,
          {
            parameter: keyword,
            partialCommand,
          }
        );
      }
    } else {
      if (!keyword.isFlag) {
        return ArgumentParseError.Result(
          `An associated argument was not provided for the keyword ${keyword.name}.`,
          { parameter: keyword, partialCommand }
        );
      } else {
        return Ok(true);
      }
    }
  }

  public parseKeywords(partialCommand: PartialCommand): Result<this> {
    const stream = partialCommand.stream;
    while (stream.peekItem()?.object instanceof Keyword) {
      const item = stream.readItem() as Presentation<Keyword>;
      const description = getOwn(
        this.description.keywordDescriptions,
        item.object.designator
      );
      if (description === undefined) {
        if (this.description.allowOtherKeys) {
          throw new TypeError("Allow other keys is umimplemented");
          // i don't think this can be implemented,
          // how do you tell an extra key is a flag or has an associated
          // property?
        } else {
          return UnexpectedArgumentError.Result(
            `Encountered unexpected keyword argument: ${item.object.designator}`,
            { partialCommand }
          );
        }
      } else {
        const associatedPropertyResult = this.readKeywordAssociatedProperty(
          // idk why typescript is bottoming out here but whatever.
          description as unknown as KeywordParametersDescription["keywordDescriptions"][string],
          partialCommand
        );
        if (isError(associatedPropertyResult)) {
          return associatedPropertyResult;
        } else {
          this.arguments.set(description.name, associatedPropertyResult.ok);
        }
      }
    }
    return Ok(this);
  }

  public parseRest(
    partialCommand: PartialCommand,
    restDescription?: RestDescription
  ): Result<Presentation[] | undefined> {
    const stream = partialCommand.stream;
    if (restDescription !== undefined) {
      return restDescription.parseRest(
        partialCommand,
        this as unknown as KeywordParser
      );
    } else {
      const result = this.parseKeywords(partialCommand);
      if (isError(result)) {
        return result;
      }
      if (stream.peekItem() !== undefined) {
        const textRendering = (() => {
          try {
            return TextPresentationRenderer.render(stream.peekItem());
          } catch (_e) {
            return `${JSON.stringify(stream.peekItem()?.object)} (fallback representation)`;
          }
        })();
        return UnexpectedArgumentError.Result(
          `There is an unexpected non-keyword argument: ${textRendering}`,
          { partialCommand }
        );
      } else {
        return Ok(undefined);
      }
    }
  }
}

export type DescribeKeywordParametersOptions<
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> = {
  readonly keywordDescriptions: {
    [I in keyof TKeywordsMeta]: DescribeKeywordProperty<TKeywordsMeta[I]>;
  };
  readonly allowOtherKeys?: boolean;
};

function describeKeywordProperty<ObjectType>(
  name: string,
  property: DescribeKeywordProperty<ObjectType>
): KeywordPropertyDescription<ObjectType> {
  if (property.acceptor === undefined) {
    if (!property.isFlag) {
      throw new TypeError(
        "An acceptor is required if the property is not a flag."
      );
    }
  }
  const acceptor = ((acceptor) => {
    if (acceptor === undefined) {
      return TopPresentationSchema;
    } else if ("schemaType" in acceptor) {
      return acceptor;
    } else {
      return {
        schemaType: PresentationSchemaType.Single,
        presentationType: acceptor,
      } as SinglePresentationSchema<ObjectType>;
    }
  })(property.acceptor);
  return {
    name,
    isFlag: property.isFlag ?? false,
    acceptor,
    description: property.description,
  };
}

export function describeKeywordParameters<
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
>(
  options: DescribeKeywordParametersOptions<TKeywordsMeta>
): KeywordParametersDescription<TKeywordsMeta> {
  const keywordDescriptions: Record<string, KeywordPropertyDescription> = {};
  for (const [name, property] of Object.entries(options.keywordDescriptions)) {
    keywordDescriptions[name] = describeKeywordProperty(
      name,
      property as DescribeKeywordProperty
    );
  }
  return {
    keywordDescriptions:
      keywordDescriptions as KeywordPropertyDescriptionsFromKeywordsMeta<TKeywordsMeta>,
    allowOtherKeys: options.allowOtherKeys ?? false,
    getParser() {
      return new KeywordParser(this);
    },
  };
}
