// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringServerName,
  StringServerNameRegexPart,
} from "./StringServerName";

export const StringMediaURIRegex = new RegExp(
  `^mxc://(?<serverName>${StringServerNameRegexPart.source})/(?<mediaId>[A-Za-z0-9_-]+)$`
);

export type StringMediaURIBrand = {
  readonly StringMediaURI: unique symbol;
};

export type StringMediaURI = string & StringMediaURIBrand;

export function isStringMediaURI(string: string): string is StringMediaURI {
  return StringMediaURIRegex.test(string);
}

export function StringMediaURI(string: unknown): StringMediaURI {
  if (typeof string === "string" && isStringMediaURI(string)) {
    return string as StringMediaURI;
  }
  throw new TypeError("Not a valid StringMediaURI");
}

export function MediaURIServerName(uri: StringMediaURI): StringServerName {
  const match = StringMediaURIRegex.exec(uri)?.groups?.serverName;
  if (match === undefined) {
    throw new TypeError("Somehow a StringMediaURI was created that is invalid.");
  }
  return StringServerName(match);
}

export function MediaURIMediaID(uri: StringMediaURI): string {
  const match = StringMediaURIRegex.exec(uri)?.groups?.mediaID;
  if (match === undefined) {
    throw new TypeError("Somehow a StringMediaURI was created that is invalid.");
  }
  return match;
}
