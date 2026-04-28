// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringServerName,
  StringServerNameRegexPart,
} from "./StringServerName";

export const StringMXCURIRegex = new RegExp(
  `^mxc://(?<serverName>${StringServerNameRegexPart.source})/(?<mediaId>[A-Za-z0-9_-]+)$`
);

export type StringMXCURIBrand = {
  readonly StringMXCURI: unique symbol;
};

export type StringMXCURI = string & StringMXCURIBrand;

export function isStringMXCURI(string: string): string is StringMXCURI {
  return StringMXCURIRegex.test(string);
}

export function StringMXCURI<T>(
  string: unknown
): T extends StringMXCURI ? StringMXCURI : never {
  if (typeof string === "string" && isStringMXCURI(string)) {
    return string as T extends StringMXCURI ? StringMXCURI : never;
  }
  throw new TypeError("Not a valid StringMXCURI");
}

export function mxcURIServerName(uri: StringMXCURI): StringServerName {
  const match = StringMXCURIRegex.exec(uri)?.groups?.serverName;
  if (match === undefined) {
    throw new TypeError("Somehow a StringMXCURI was created that is invalid.");
  }
  return StringServerName(match);
}

export function mxcURIMediaId(uri: StringMXCURI): string {
  const match = StringMXCURIRegex.exec(uri)?.groups?.mediaId;
  if (match === undefined) {
    throw new TypeError("Somehow a StringMXCURI was created that is invalid.");
  }
  return match;
}
