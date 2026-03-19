// SPDX-FileCopyrightText: 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { StringStream } from "@gnuxie/super-cool-stream";
import { isError } from "@gnuxie/typescript-result";
import {
  MatrixEventReference,
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixRoomReference,
  MatrixUserID,
  Permalinks,
  isStringRoomAlias,
  isStringRoomID,
  isStringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Presentation } from "../Command/Presentation";
import { Keyword } from "../Command/Keyword";
import {
  BooleanPresentationType,
  KeywordPresentationType,
  MatrixEventReferencePresentationType,
  MatrixRoomAliasPresentationType,
  MatrixRoomIDPresentationType,
  MatrixUserIDPresentationType,
  NumberPresentationType,
  StringPresentationType,
} from "./TextPresentationTypes";

/** Whitespace we want to nom. */
const WHITESPACE = [" ", "\r", "\f", "\v", "\n", "\t"];

/**
 * Transforms a command from a string to a list of `Presentation`s.
 * The reader works by reading the command word by word (\S),
 * producing a Presentation for each word.
 * The reader doesn't produce an AST because there isn't any syntax that can make a tree,
 * only a flat list can be produced.
 * This allows commands to be dispatched based on `Presentation` and allows
 * for more efficient (in terms of loc) parsing of arguments.
 *
 * @param string The command.
 * @returns Presentations that have been read from this command.
 */
export function readCommand(string: string): Presentation[] {
  return readCommandFromStream(new StringStream(string));
}

function readCommandFromStream(stream: StringStream): Presentation[] {
  const words: (Presentation | string)[] = [];
  eatWhitespace(stream);
  while (stream.peekChar() !== undefined) {
    words.push(readItem(stream));
    eatWhitespace(stream);
  }
  return words.map(applyPostReadTransformersToReadItem);
}

function eatWhitespace(stream: StringStream): void {
  readUntil(/\S/, stream, []);
}

function readWord(stream: StringStream): string {
  const word: string[] = [stream.readChar()];
  readUntil(/\s/, stream, word);
  return word.join("");
}

/**
 * Read a single "Item".
 * @param stream Stream to read the item from, must be at the beginning of a word not be EOF or whitespace.
 * @returns A single ReadItem.
 */
function readItem(stream: StringStream): Presentation | string {
  if (stream.peekChar() === undefined) {
    throw new TypeError("EOF");
  }
  if (WHITESPACE.includes(stream.peekChar())) {
    throw new TypeError("whitespace should have been stripped");
  }
  const dispatchCharacter = stream.peekChar();
  if (dispatchCharacter === undefined) {
    throw new TypeError(
      `There should be a dispatch character and if there isn't then the code is wrong`
    );
  }
  const macro = WORD_DISPATCH_CHARACTERS.get(dispatchCharacter);
  if (macro) {
    return macro(stream);
  } else {
    // Then read a normal word.
    return readWord(stream);
  }
}

/**
 * A reader macro that produces a ReadItem based on a dispatch character.
 * A dispatch character is the character at the beginning of a word.
 */
type ReadMacro = (stream: StringStream) => Presentation | string;

const WORD_DISPATCH_CHARACTERS = new Map<string, ReadMacro>();

/**
 * Defines a read macro to produce a read item.
 * @param dispatchCharacter A character at the start of a word that `readItem`
 * should use this macro to produce a `ReadItem` with.
 * @param macro A function that reads a stream and produces a `ReadItem`
 */
function defineReadItem(dispatchCharacter: string, macro: ReadMacro) {
  if (WORD_DISPATCH_CHARACTERS.has(dispatchCharacter)) {
    throw new TypeError(
      `Read macro already defined for this dispatch character: ${dispatchCharacter}`
    );
  }
  WORD_DISPATCH_CHARACTERS.set(dispatchCharacter, macro);
}

type PostReadStringReplaceTransformer = (item: string) => Presentation | string;
type TransformerEntry = {
  regex: RegExp;
  transformer: PostReadStringReplaceTransformer;
};
const POST_READ_TRANSFORMERS = new Map<string, TransformerEntry>();

/**
 * Define a function that will be applied to ReadItem's that are strings that
 * also match the regex.
 * If the regex matches, the transformer function will be called with the read item
 * and given the oppertunity to return a new version of the item.
 *
 * This is mainly used to transform URLs into a MatrixRoomReference.
 */
function definePostReadReplace(
  regex: RegExp,
  transformer: PostReadStringReplaceTransformer
) {
  if (POST_READ_TRANSFORMERS.has(regex.source)) {
    throw new TypeError(
      `A transformer has already been defined for the regexp ${regex.source}`
    );
  }
  POST_READ_TRANSFORMERS.set(regex.source, { regex, transformer });
}

function applyPostReadTransformersToReadItem(
  item: Presentation | string
): Presentation {
  if (typeof item === "string") {
    for (const [, { regex, transformer }] of POST_READ_TRANSFORMERS) {
      if (regex.test(item)) {
        const transformResult = transformer(item);
        if (typeof transformResult !== "string") {
          return transformResult;
        }
      }
    }
    return StringPresentationType.wrap(item);
  }
  return item;
}

/**
 * Helper that consumes from `stream` and appends to `output` until a character is peeked matching `regex`.
 * @param regex A regex for a character to stop at.
 * @param stream A stream to consume from.
 * @param output An array of characters.
 * @returns `output`.
 */
function readUntil(regex: RegExp, stream: StringStream, output: string[]) {
  while (stream.peekChar() !== undefined && !regex.test(stream.peekChar())) {
    output.push(stream.readChar());
  }
  return output;
}

/**
 * Produce a `MatrixRoomReference` from the stream from a room alias or id.
 * Returns a string if the room id or alias is malformed (and thus representing something else).
 * @param stream The stream to consume the room reference from.
 * @returns A MatrixRoomReference or string if what has been read does not represent a room.
 */
function readRoomIDOrAlias(
  stream: StringStream
): Presentation<MatrixRoomReference> | string {
  const word: string[] = [stream.readChar()];
  readUntil(/\s/, stream, word);
  const wholeWord = word.join("");
  if (isStringRoomID(wholeWord)) {
    return MatrixRoomIDPresentationType.wrap(new MatrixRoomID(wholeWord));
  } else if (isStringRoomAlias(wholeWord)) {
    return MatrixRoomAliasPresentationType.wrap(new MatrixRoomAlias(wholeWord));
  } else {
    return wholeWord;
  }
}

/**
 * Read the word as an alias if it is an alias, otherwise it will just return a string token.
 */
defineReadItem("#", readRoomIDOrAlias);
defineReadItem("!", readRoomIDOrAlias);

/**
 * Read the word as a UserID, otherwise return a string if what has been read doesn not represent a user.
 */
defineReadItem(
  "@",
  (stream: StringStream): Presentation<MatrixUserID> | string => {
    const word: string[] = [stream.readChar()];
    readUntil(/[:\s]/, stream, word);
    if (
      stream.peekChar() === undefined ||
      WHITESPACE.includes(stream.peekChar())
    ) {
      return word.join("");
    }
    readUntil(/\s/, stream, word);
    const maybeUserID = word.join("");
    if (isStringUserID(maybeUserID)) {
      return MatrixUserIDPresentationType.wrap(new MatrixUserID(maybeUserID));
    } else {
      return maybeUserID;
    }
  }
);

function maybeReadInteger(
  stream: StringStream
): Presentation<number> | undefined {
  const isNegative = stream.peekChar() === "-";
  if (isNegative) {
    stream.readChar();
  }
  let word = "";
  while (stream.peekChar() !== undefined && /^[0-9]$/.test(stream.peekChar())) {
    const char = stream.readChar();
    if (char === undefined) {
      throw new TypeError(
        "Shouldn't be possible cos we're checking if it's undefined in the loop clause"
      );
    }
    word += char;
  }
  const number = isNegative ? -Number.parseInt(word) : Number.parseInt(word);
  return word.length > 0 ? NumberPresentationType.wrap(number) : undefined;
}

function readKeywordOrNegativeInteger(
  stream: StringStream
): Presentation<Keyword> | Presentation<number> {
  const maybeInteger = stream.savingPositionIf({
    predicate: (t) => t === undefined,
    body: (stream) => maybeReadInteger(stream as StringStream),
  });
  if (maybeInteger !== undefined) {
    return maybeInteger as Presentation<number>;
  } else {
    return readKeyword(stream);
  }
}

/**
 * Read a keyword frorm the stream, throws away all of the prefixing `[:-]` characters
 * when producing the keyword designator.
 * @param stream A stream to consume the keyword from.
 * @returns A `Keyword`
 */
function readKeyword(stream: StringStream): Presentation<Keyword> {
  readUntil(/[^-:]/, stream, []);
  if (stream.peekChar() === undefined) {
    return KeywordPresentationType.wrap(new Keyword(""));
  }
  const word: string[] = [stream.readChar()];
  readUntil(/[\s]/, stream, word);
  return KeywordPresentationType.wrap(new Keyword(word.join("")));
}

defineReadItem("-", readKeywordOrNegativeInteger);
defineReadItem(":", readKeywordOrNegativeInteger);

function maybeReadQuotedString(
  stream: StringStream
): Presentation<string> | undefined {
  if (stream.peekChar() !== '"') {
    return undefined;
  }
  stream.readChar();
  const word: string[] = [];
  do {
    readUntil(/"/, stream, word);
    if (stream.peekChar() === '"' && word.at(-1) === "\\") {
      word.pop();
      word.push('"');
      stream.readChar();
      if (stream.peekChar() === undefined) {
        return StringPresentationType.wrap(word.join(""));
      } else {
        continue;
      }
    } else if (stream.peekChar() === '"') {
      stream.readChar();
      // wrap to stop post processing of the string
      // which is the reason they are quoting in the first place.
      return StringPresentationType.wrap(word.join(""));
    } else if (stream.peekChar() === undefined) {
      // the only reason we don't error here is because we don't have the infrastructure
      // for how reader errors will work and not look confusing as shit.
      return undefined;
    }
    // eslint-disable-next-line no-constant-condition
  } while (true);
}

function readString(stream: StringStream): string | Presentation<string> {
  const quotedString = stream.savingPositionIf({
    predicate: (t) => t === undefined,
    body: (stream) => maybeReadQuotedString(stream as StringStream),
  });
  if (quotedString !== undefined) {
    return quotedString as Presentation<string>;
  } else {
    // we want these to be transformable read items.
    return readWord(stream);
  }
}

defineReadItem('"', readString);

definePostReadReplace(/^https:\/\/matrix\.to/, (input) => {
  const parseResult = Permalinks.parseUrl(input);
  if (isError(parseResult)) {
    // it's an invalid URI.
    return input;
  }
  const url = parseResult.ok;
  if (url.eventID !== undefined) {
    const eventResult = MatrixEventReference.fromPermalink(input);
    if (isError(eventResult)) {
      return input;
    } else {
      return MatrixEventReferencePresentationType.wrap(eventResult.ok);
    }
  } else if (url.userID !== undefined) {
    return MatrixUserIDPresentationType.wrap(new MatrixUserID(url.userID));
  } else {
    const roomResult = MatrixRoomReference.fromPermalink(input);
    if (isError(roomResult)) {
      return input;
    } else {
      if (roomResult.ok instanceof MatrixRoomID) {
        return MatrixRoomIDPresentationType.wrap(roomResult.ok);
      } else {
        return MatrixRoomAliasPresentationType.wrap(roomResult.ok);
      }
    }
  }
});

definePostReadReplace(/^[0-9]+$/, (input) => {
  return NumberPresentationType.wrap(Number.parseInt(input));
});

definePostReadReplace(/^true|false$/, (input) => {
  return BooleanPresentationType.wrap(input === "true");
});
