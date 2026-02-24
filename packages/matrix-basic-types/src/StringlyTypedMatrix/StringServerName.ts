// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-basic-types
// https://github.com/the-draupnir-project/matrix-basic-types
// </text>

/**
 * Do NOT use this regex to verify incoming events because servers are fucking shit
 * and cannot validate anything when it counts.
 */
export const StringServerNameRegexPart =
  /(?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9A-Fa-f:.]{2,45}\]|[A-Za-z0-9.-]{1,255})(?::\d{1,5})?/;
export const StringServerNameRegex = new RegExp(
  `^${StringServerNameRegexPart.source}$`
);

export type StringServerNameBrand = {
  readonly StringServerName: unique symbol;
};
export type StringServerName = string & StringServerNameBrand;

export function isStringServerName(string: string): string is StringServerName {
  return StringServerNameRegex.test(string);
}

export function StringServerName<T>(
  string: unknown
): T extends StringServerName ? StringServerName : never {
  if (typeof string === "string" && isStringServerName(string)) {
    return string as T extends StringServerName ? StringServerName : never;
  }
  throw new TypeError("Not a valid StringServerName");
}
