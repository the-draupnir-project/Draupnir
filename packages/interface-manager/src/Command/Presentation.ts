// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
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

/**
 * This exists because typescript is bad and if you
 * have the wrap function on in a type assertion, then
 * it will complain because the argument is not assignable to unknown.
 * As obviously the argument in the wrapper function is specific.
 */
export interface PresentationTypeWithoutWrap<ObjectType = unknown> {
  name: string;
  /**
   * Used when creating a presentation to ensure value is ObjectType.
   * This should not be used to determine the type of a given presentation,
   * that's what the `type` field on the presentation is for.
   */
  validator: (value: unknown) => value is ObjectType;
}

export type PresentationType<ObjectType = unknown> =
  PresentationTypeWithoutWrap<ObjectType> & {
    wrap: (object: ObjectType) => Presentation<ObjectType>;
  };

export type ObjectTypeFromPresentationType<T> =
  T extends PresentationTypeWithoutWrap<infer ObjectType> ? ObjectType : never;

export interface Presentation<ObjectType = unknown> {
  object: ObjectType;
  presentationType: PresentationTypeWithoutWrap<ObjectType>;
}

const PRESENTATION_TYPES = new Map<
  /* the name of the presentation type. */ string,
  PresentationType
>();

export function findPresentationType<ObjectType = unknown>(
  name: string
): PresentationType<ObjectType> {
  const entry = PRESENTATION_TYPES.get(name);
  if (entry) {
    return entry as PresentationType<ObjectType>;
  } else {
    throw new TypeError(
      `presentation type with the name: ${name} was not registered`
    );
  }
}

export function registerPresentationType<ObjectType>(
  name: string,
  presentationType: PresentationType<ObjectType>
): PresentationType<ObjectType> {
  if (PRESENTATION_TYPES.has(name)) {
    throw new TypeError(
      `presentation type with the name: ${name} has already been registered`
    );
  }
  PRESENTATION_TYPES.set(name, presentationType as PresentationType);
  return presentationType;
}

export function definePresentationType<ObjectType>(
  description: PresentationType<ObjectType>
): PresentationType<ObjectType> {
  return registerPresentationType(description.name, Object.freeze(description));
}
