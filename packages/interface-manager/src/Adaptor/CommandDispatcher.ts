// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { isError, Result } from "@gnuxie/typescript-result";
import {
  PartialCommand,
  Presentation,
  PresentationArgumentStream,
} from "../Command";
import { CommandInvokerCallbacks } from "./CommandInvokerCallbacks";
import {
  Permalinks,
  StringUserID,
  userLocalpart,
} from "@the-draupnir-project/matrix-basic-types";
import { StringStream } from "@gnuxie/super-cool-stream";

export type CommandNormaliser = (body: string) => string | undefined;
export type LogCurentCommandCB<CommandInformation> = (
  CommandInformation: CommandInformation,
  commandParts: Presentation[]
) => void;

export interface CommandDispatcherCallbacks<
  CommandInformation,
> extends CommandInvokerCallbacks<CommandInformation> {
  readonly logCurrentCommandCB?:
    | LogCurentCommandCB<CommandInformation>
    | undefined;
  /**
   * A function to normalize a command before dispatch.
   * So for example, removing mention pill formatting or
   * special configuration for bot prefixes etc.
   */
  readonly commandNormaliser: CommandNormaliser;
}

export interface CommandDispatcher<CommandInformation> {
  parsePartialCommandFromBody(
    commandInformation: CommandInformation,
    body: string
  ): Result<PartialCommand>;
  parsePartialCommandFromStream(
    commandInformation: CommandInformation,
    stream: PresentationArgumentStream
  ): Result<PartialCommand>;
}

function readUntil(regex: RegExp, stream: StringStream): string | undefined {
  let output = "";
  while (stream.peekChar() !== undefined && !regex.test(stream.peekChar())) {
    output += stream.readChar<string>();
  }
  return output.length === 0 ? undefined : output;
}

type StandardPrefixExtractorOptions = {
  symbolPrefixes: string[];
  isAllowedOnlySymbolPrefixes: boolean;
  additionalPrefixes: string[];
  getDisplayName: () => string;
  // Set it to '' if you don't want it.
  normalisedPrefix: string;
};

function maybeReadPrefixes(
  body: string,
  plainPrefixes: string[],
  {
    symbolPrefixes,
    isAllowedOnlySymbolPrefixes,
    normalisedPrefix,
  }: StandardPrefixExtractorOptions
): string | undefined {
  const stream = new StringStream(body);
  readUntil(/\S/, stream);
  const firstWord = readUntil(/\s/, stream);
  if (firstWord === undefined || typeof firstWord !== "string") {
    return undefined;
  }
  const usedSymbolPrefix = symbolPrefixes.find((p) =>
    firstWord.toLowerCase().startsWith(p)
  );
  const additionalPrefixTarget = usedSymbolPrefix
    ? firstWord.slice(usedSymbolPrefix.length)
    : firstWord;
  const usedAdditionalPrefix = plainPrefixes.find(
    (p) => additionalPrefixTarget.toLowerCase() === p
  );
  if (usedAdditionalPrefix && usedSymbolPrefix) {
    return (
      normalisedPrefix + (stream.source as string).slice(stream.getPosition())
    );
  }
  if (usedSymbolPrefix && isAllowedOnlySymbolPrefixes) {
    return (
      normalisedPrefix +
      " " +
      additionalPrefixTarget +
      (stream.source as string).slice(stream.getPosition())
    );
  }
  return undefined;
}

function maybeExtractDisplayNameMention(
  body: string,
  displayNameWords: string[],
  options: StandardPrefixExtractorOptions
): string | undefined {
  const stream = new StringStream(body);
  for (const name of displayNameWords) {
    readUntil(/\S/, stream);
    const word = readUntil(/\s/, stream);
    if (word === undefined) {
      return undefined;
    }
    // check for : on the end of pills.
    if (word.endsWith(":")) {
      if (word.slice(0, word.length - 1) !== name) {
        return undefined;
      }
    } else if (word !== name) {
      return undefined;
    }
  }
  readUntil(/\S/, stream);
  if (stream.peekChar() === ":") {
    stream.readChar();
  }
  return (
    options.normalisedPrefix +
    " " +
    (stream.source as string).slice(stream.getPosition())
  );
}

function maybeExtractMarkdownMention(
  body: string,
  clientUserID: StringUserID,
  normalisedPrefix: string
): string | undefined {
  const result = /^\[[^\]]+\]\(([^)]+)\)\s*:?/.exec(body);
  if (result === null || result[1] === undefined) {
    return undefined;
  }
  const urlResult = Permalinks.parseUrl(result[1]);
  if (isError(urlResult)) {
    return undefined;
  }
  if (urlResult.ok.userID !== clientUserID) {
    return undefined;
  }
  return normalisedPrefix + " " + body.slice(result[0].length).trimStart();
}

export function makeCommandNormaliser(
  clientUserID: StringUserID,
  options: StandardPrefixExtractorOptions
): CommandNormaliser {
  const { additionalPrefixes, getDisplayName, normalisedPrefix } = options;
  const plainPrefixes = [
    userLocalpart(clientUserID),
    clientUserID,
    ...additionalPrefixes,
  ];
  // Remember to check for shit like :
  // These are the ways that a prefix can be used:
  // 1. By a displayname or a mention pill
  // 2. By an additional prefix like the draupnir in !draupnir
  // 3. By use of just a symbol prefix like ! and nothing else.
  return (body) => {
    const prefixResult = maybeReadPrefixes(body, plainPrefixes, options);
    if (prefixResult !== undefined) {
      return prefixResult;
    }
    // now we just need to match against displaynames and other pills
    const displayNameWords = getDisplayName().split(/\s+/).filter(Boolean);
    const displayNameResult = maybeExtractDisplayNameMention(
      body,
      displayNameWords,
      options
    );
    if (displayNameResult !== undefined) {
      return displayNameResult;
    }
    return maybeExtractMarkdownMention(body, clientUserID, normalisedPrefix);
  };
}
