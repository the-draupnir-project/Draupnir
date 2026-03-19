// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  ObjectTypeFromPresentationType,
  Presentation,
  PresentationTypeWithoutWrap,
} from "./Presentation";
import { CommandTable } from "./CommandTable";

export enum PresentationSchemaType {
  Single = "Single",
  Union = "Union",
  Top = "Top",
}

type ObjectTypeForSingleSchema<T extends SinglePresentationSchema> =
  T["presentationType"] extends PresentationTypeWithoutWrap<infer ObjectType>
    ? ObjectType
    : never;

type ObjectTypeForUnionSchema<T extends UnionPresentationSchema> =
  T["variants"] extends PresentationTypeWithoutWrap<infer ObjectType>[]
    ? ObjectType
    : never;

type ObjectTypeForTopSchema = unknown;

/**
 * There is something wrong with the way argument parsing code is using validators
 * of presnetation types. When a parameter has declared that it expects arguments
 * to be of a presnetation type, all we should be doing is checking that the
 * presentationType of the argument is the specified presentation type.
 *
 * This works, except what happens when we want a command that accepts a union
 * of presentation types, or maybe the union of all known presentation types?
 *
 * Well that is probably an issue for the parameter description code right?
 * It has to specify a schema for the argument to get the presentation types it
 * expects, rather than just a presentation type.
 *
 * So is born the presentation schema.
 */
export type SinglePresentationSchema<ObjectType = unknown> = {
  readonly schemaType: PresentationSchemaType.Single;
  readonly presentationType: PresentationTypeWithoutWrap<ObjectType>;
};

export type UnionPresentationSchema<ObjectType = unknown> = {
  readonly schemaType: PresentationSchemaType.Union;
  readonly variants: PresentationTypeWithoutWrap<ObjectType>[];
};

export type TopPresentationSchema = {
  readonly schemaType: PresentationSchemaType.Top;
};

export const TopPresentationSchema: TopPresentationSchema = Object.freeze({
  schemaType: PresentationSchemaType.Top,
});

export type PresentationSchema<ObjectType = unknown> =
  | SinglePresentationSchema<ObjectType>
  | UnionPresentationSchema<ObjectType>
  | TopPresentationSchema;

export type ObjectTypeForPresentationSchema<T> =
  T extends SinglePresentationSchema
    ? ObjectTypeForSingleSchema<T>
    : T extends UnionPresentationSchema
      ? ObjectTypeForUnionSchema<T>
      : T extends TopPresentationSchema
        ? ObjectTypeForTopSchema
        : never;

export function checkPresentationSchema<ObjectType>(
  schema: PresentationSchema,
  presentation: Presentation
): presentation is Presentation<ObjectType> {
  switch (schema.schemaType) {
    case PresentationSchemaType.Single:
      return presentation.presentationType === schema.presentationType;
    case PresentationSchemaType.Union:
      return Boolean(
        schema.variants.find(
          (presentationType) =>
            presentation.presentationType === presentationType
        )
      );
    case PresentationSchemaType.Top:
      return true;
  }
}

export function acceptPresentation<ObjectType>(
  schema: PresentationSchema<ObjectType>,
  commandTable: CommandTable,
  presentation: Presentation
): Presentation<ObjectType> | undefined {
  if (checkPresentationSchema<ObjectType>(schema, presentation)) {
    return presentation;
  } else if (schema.schemaType === PresentationSchemaType.Single) {
    const translator = commandTable.findPresentationTypeTranslator(
      schema.presentationType,
      presentation.presentationType
    );
    if (translator) {
      return translator.translate(presentation) as Presentation<ObjectType>;
    } else {
      return undefined;
    }
  } else if (schema.schemaType === PresentationSchemaType.Union) {
    for (const variant of schema.variants) {
      const result = acceptPresentation(
        {
          schemaType: PresentationSchemaType.Single,
          presentationType: variant,
        },
        commandTable,
        presentation
      );
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }
  throw new TypeError(`The code is wrong`);
}

export function printPresentationSchema(schema: PresentationSchema): string {
  switch (schema.schemaType) {
    case PresentationSchemaType.Single:
      return schema.presentationType.name;
    case PresentationSchemaType.Union:
      return schema.variants.map((type) => type.name).join(" | ");
    case PresentationSchemaType.Top:
      return `TopPresentationSchema`;
  }
}

type Acceptor<ObjectType = unknown> =
  | PresentationSchema<ObjectType>
  | PresentationTypeWithoutWrap<ObjectType>;
export type ObjectTypeFromAcceptor<T> = T extends PresentationTypeWithoutWrap
  ? ObjectTypeFromPresentationType<T>
  : T extends PresentationSchema
    ? ObjectTypeForPresentationSchema<T>
    : never;

type UnionOfObjectTypes<T extends Acceptor[]> = {
  [P in keyof T]: T[P] extends Acceptor<infer U> ? U : never;
}[number];

export function union<
  TAcceptor extends (PresentationTypeWithoutWrap | UnionPresentationSchema)[],
>(
  ...acceptors: TAcceptor
): UnionPresentationSchema<UnionOfObjectTypes<TAcceptor>> {
  type PresentationTypeForUnion = PresentationTypeWithoutWrap<
    UnionOfObjectTypes<TAcceptor>
  >;
  const presentationTypes = acceptors.reduce<PresentationTypeForUnion[]>(
    (acc, acceptor) => {
      if ("schemaType" in acceptor) {
        acc.push(...(acceptor.variants as PresentationTypeForUnion[]));
      } else {
        acc.push(acceptor as PresentationTypeForUnion);
      }
      return acc;
    },
    []
  );
  return {
    schemaType: PresentationSchemaType.Union,
    variants: presentationTypes,
  } as UnionPresentationSchema<UnionOfObjectTypes<TAcceptor>>;
}
