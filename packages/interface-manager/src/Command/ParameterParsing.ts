// Copyright 2022, 2024 Gnuxie <Gnuxie@protonmail.com>
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

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import { ParameterDescription } from "./ParameterDescription";
import {
  DescribeRestParameters,
  RestDescription,
  describeRestParameters,
} from "./RestParameterDescription";
import {
  DescribeKeywordParametersOptions,
  KeywordParametersDescription,
  describeKeywordParameters,
} from "./KeywordParameterDescription";
import { CompleteCommand, PartialCommand } from "./Command";
import { ArgumentParseError, PromptRequiredError } from "./ParseErrors";
import { TextPresentationRenderer } from "../TextReader/TextPresentationRenderer";
import { Presentation, PresentationTypeWithoutWrap } from "./Presentation";
import {
  PresentationSchema,
  PresentationSchemaType,
  acceptPresentation,
  printPresentationSchema,
} from "./PresentationSchema";
import { ObjectTypeFromAcceptor } from "./PresentationSchema";
import { KeywordsMeta } from "./CommandMeta";

export type ParameterParseFunction = (
  partialCommand: PartialCommand
) => Result<CompleteCommand>;

export interface CommandParametersDescription<
  TImmediateArgumentsObjectTypes extends unknown[] = unknown[],
  TRestArgumentObjectType = unknown,
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> {
  readonly parse: ParameterParseFunction;
  readonly descriptions: {
    [I in keyof TImmediateArgumentsObjectTypes]: ParameterDescription<
      TImmediateArgumentsObjectTypes[I]
    >;
  };
  readonly rest?: RestDescription<TRestArgumentObjectType> | undefined;
  readonly keywords: KeywordParametersDescription<TKeywordsMeta>;
}

export class StandardCommandParametersDescription<
  TImmediateArgumentsObjectTypes extends unknown[] = unknown[],
  TRestArgumentObjectType = unknown,
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> implements CommandParametersDescription<
  TImmediateArgumentsObjectTypes,
  TRestArgumentObjectType,
  TKeywordsMeta
> {
  constructor(
    public readonly descriptions: {
      [I in keyof TImmediateArgumentsObjectTypes]: ParameterDescription<
        TImmediateArgumentsObjectTypes[I]
      >;
    },
    public readonly keywords: KeywordParametersDescription<TKeywordsMeta>,
    public readonly rest?: RestDescription<TRestArgumentObjectType> | undefined
  ) {}

  public parse(partialCommand: PartialCommand): Result<CompleteCommand> {
    const keywordsParser = this.keywords.getParser();
    const stream = partialCommand.stream;
    const immediateArguments: Presentation[] = [];
    for (const parameter of this.descriptions) {
      // it eats any keywords at any point in the stream
      // as they can appear at any point technically.
      const keywordResult = keywordsParser.parseKeywords(partialCommand);
      if (isError(keywordResult)) {
        return keywordResult;
      }
      const nextItem = stream.peekItem();
      if (nextItem === undefined) {
        if (parameter.prompt) {
          return PromptRequiredError.Result(
            `An argument for the parameter ${parameter.name} was expected but was not provided. A prompt is available for this parameter.`,
            {
              promptParameter: parameter,
              partialCommand: partialCommand,
            }
          );
        } else {
          return ArgumentParseError.Result(
            `An argument for the parameter ${parameter.name} was expected but was not provided.`,
            { parameter, partialCommand: partialCommand }
          );
        }
      }
      const acceptedPresentation = acceptPresentation(
        parameter.acceptor,
        partialCommand.commandTable,
        nextItem
      );
      if (acceptedPresentation === undefined) {
        return ArgumentParseError.Result(
          `Was expecting a match for the presentation type: ${printPresentationSchema(parameter.acceptor)} but got ${TextPresentationRenderer.render(nextItem)}.`,
          {
            parameter: parameter,
            partialCommand: partialCommand,
          }
        );
      }
      stream.readItem(); // disopose of argument.
      immediateArguments.push(acceptedPresentation);
    }
    const restResult = keywordsParser.parseRest(partialCommand, this.rest);
    if (isError(restResult)) {
      return restResult;
    }
    return Ok({
      description: partialCommand.description,
      immediateArguments: immediateArguments.map((p) => p.object),
      keywords: keywordsParser.getKeywords(),
      rest: restResult.ok?.map((p) => p.object) ?? [],
      designator: partialCommand.designator,
      isPartial: false,
      commandTable: partialCommand.commandTable,
      toPartialCommand() {
        return {
          description: partialCommand.description,
          stream: stream,
          isPartial: true,
          designator: partialCommand.designator,
          commandTable: partialCommand.commandTable,
        };
      },
    });
  }
}

export type DescribeCommandParametersOptions<
  TImmediateArgumentsObjectTypes extends unknown[] = unknown[],
  TRestArgumentObjectType = unknown,
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
> = {
  readonly parameters: {
    [I in keyof TImmediateArgumentsObjectTypes]: DescribeParameter<
      TImmediateArgumentsObjectTypes[I]
    >;
  };
  readonly rest?: DescribeRestParameters<TRestArgumentObjectType> | undefined;
  readonly keywords?:
    | DescribeKeywordParametersOptions<TKeywordsMeta>
    | undefined;
};
export function describeCommandParameters<
  TImmediateArgumentsObjectTypes extends unknown[] = unknown[],
  TRestArgumentObjectType = unknown,
  TKeywordsMeta extends KeywordsMeta = KeywordsMeta,
>(
  options: DescribeCommandParametersOptions<
    TImmediateArgumentsObjectTypes,
    TRestArgumentObjectType,
    TKeywordsMeta
  >
): CommandParametersDescription<
  TImmediateArgumentsObjectTypes,
  TRestArgumentObjectType,
  TKeywordsMeta
> {
  return new StandardCommandParametersDescription<
    TImmediateArgumentsObjectTypes,
    TRestArgumentObjectType,
    TKeywordsMeta
  >(
    parameterDescriptionsFromParameterOptions(options.parameters),
    options.keywords === undefined
      ? describeKeywordParameters({
          keywordDescriptions:
            {} as DescribeKeywordParametersOptions<TKeywordsMeta>["keywordDescriptions"],
          allowOtherKeys: false,
        })
      : describeKeywordParameters(options.keywords),
    options.rest === undefined
      ? undefined
      : describeRestParameters(options.rest)
  );
}

export type DescribeParameter<ObjectType> = Omit<
  ParameterDescription<ObjectType>,
  "acceptor"
> & {
  acceptor:
    | PresentationSchema<ObjectType>
    | PresentationTypeWithoutWrap<ObjectType>;
};

export type ExtractParameterObjectType<T extends DescribeParameter<never>> =
  ObjectTypeFromAcceptor<T["acceptor"]>;

function parameterDescriptionsFromParameterOptions<
  TImmediateArgumentsObjectTypes extends unknown[],
>(descriptions: {
  [I in keyof TImmediateArgumentsObjectTypes]: DescribeParameter<
    TImmediateArgumentsObjectTypes[I]
  >;
}): {
  [I in keyof TImmediateArgumentsObjectTypes]: ParameterDescription<
    TImmediateArgumentsObjectTypes[I]
  >;
} {
  return descriptions.map(describeParameter) as {
    [I in keyof TImmediateArgumentsObjectTypes]: ParameterDescription<
      TImmediateArgumentsObjectTypes[I]
    >;
  };
}

function describeParameter<ObjectType>(
  description: DescribeParameter<ObjectType>
): ParameterDescription<ObjectType> {
  if ("schemaType" in description.acceptor) {
    return description as ParameterDescription<ObjectType>;
  } else {
    return {
      ...description,
      acceptor: {
        schemaType: PresentationSchemaType.Single,
        presentationType: description.acceptor,
      },
    };
  }
}

/**
 * For some reason typescript really struggles to infer tuples.
 * So we have to use a function to guide the inference.
 * This is supposed to be used on parameter descriptions.
 */
export function tuple<T extends unknown[]>(...args: T): T {
  return args;
}
