// SPDX-FileCopyrightText: 2023 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-basic-types
// https://github.com/the-draupnir-project/matrix-basic-types
// </text>

export type StringEventIDBrand = {
  readonly StringEventID: unique symbol;
};
export type StringEventID = string & StringEventIDBrand;

export function isStringEventID(string: string): string is StringEventID {
  return string.startsWith("$");
}

export function StringEventID<T>(
  value: string
): T extends StringEventID ? StringEventID : never {
  if (isStringEventID(value)) {
    return value as T extends StringEventID ? StringEventID : never;
  }
  throw new TypeError("Not a valid StringEventID");
}
