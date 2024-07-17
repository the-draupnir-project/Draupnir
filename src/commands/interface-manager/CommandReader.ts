// SPDX-FileCopyrightText: 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from super-cool-stream
// https://github.com/Gnuxie/super-cool-stream
// </text>

import { MatrixEventReference, MatrixRoomReference, Permalinks, UserID, isError, isStringRoomAlias, isStringRoomID } from "matrix-protection-suite";
export interface SuperCoolStream<Item, Sequence> {
    readonly source: Sequence;
    peekItem<EOF = undefined>(eof?: EOF): Item | EOF;
    readItem<EOF = undefined>(eof?: EOF): Item | EOF;
    getPosition(): number;
    setPosition(n: number): void;
    clone(): SuperCoolStream<Item, Sequence>;
    savingPositionIf<Result>(description: {
      predicate: (t: Result) => boolean;
      body: (stream: SuperCoolStream<Item, Sequence>) => Result;
    }): Result;
  }

  interface Indexable<Item> {
    at(position: number): Item | undefined;
  }

  export class StandardSuperCoolStream<Item, Sequence extends Indexable<Item>>
    implements SuperCoolStream<Item, Sequence>
  {
    protected position: number;
    /**
     * Makes the super cool string stream.
     * @param source A string to act as the source of the stream.
     * @param start Where in the string we should start reading.
     */
    constructor(
      public readonly source: Sequence,
      start = 0
    ) {
      this.position = start;
    }

    public peekItem<EOF = undefined>(eof?: EOF): Item | EOF {
      return this.source.at(this.position) ?? (eof as EOF);
    }

    public readItem<EOF = undefined>(eof?: EOF) {
      return this.source.at(this.position++) ?? (eof as EOF);
    }

    public getPosition(): number {
      return this.position;
    }

    public setPosition(n: number) {
      this.position = n;
    }

    public clone(): SuperCoolStream<Item, Sequence> {
      return new StandardSuperCoolStream(this.source, this.position);
    }

    savingPositionIf<Result>(description: {
      predicate: (t: Result) => boolean;
      body: (stream: SuperCoolStream<Item, Sequence>) => Result;
    }): Result {
      const previousPosition = this.position;
      const bodyResult = description.body(this);
      if (description.predicate(bodyResult)) {
        this.position = previousPosition;
      }
      return bodyResult;
    }
  }

  /**
   * Helper for peeking and reading character by character.
   */
  export class StringStream extends StandardSuperCoolStream<
    string,
    Indexable<string>
  > {
    public peekChar<EOF = undefined>(eof?: EOF) {
      return this.peekItem(eof);
    }

    public readChar<EOF = undefined>(eof?: EOF) {
      return this.readItem(eof);
    }

    public clone(): StringStream {
      return new StringStream(this.source, this.position);
    }
  }

/** Whitespace we want to nom. */
const WHITESPACE = [' ', '\r', '\f', '\v', '\n', '\t'];

/**
 * Transforms a command from a string to a list of `ReadItem`s.
 * The reader works by reading the command word by word (\S),
 * producing a ReadItem for each word.
 * It doesn't produce an AST because there isn't any syntax that can make a tree
 * just a list.
 * This allows commands to be dispatched based on `ReadItem`s and allows
 * for more efficient (in terms of loc) parsing of arguments,
 * as I will demonstrate <link here when i've done it>.
 *
 * The technique used is somewhat inefficient in terms of resources,
 * but that is a compromise we are willing to make in order
 * to get fine control over the reader.
 * While mainting readability.
 *
 * We don't just read all words into strings (use a lexer) and then match
 * each token against a regex to transform because if we
 * add more complex structures like quotes you will
 * have to rewrite everything (ie you won't be able to add more complex structures without).
 *
 * Though the ability (to match against words) will be added for string tokens
 * because it does make it easier to transform matrix.to and matrix://
 * urls.
 *
 * @param string The command.
 * @returns ReadItems that have been read from this command.
 */
export function readCommand(string: string): ReadItem[] {
    return readCommandFromStream(new StringStream(string))
}

function readCommandFromStream(stream: StringStream): ReadItem[] {
    const words: ReadItem[] = [];
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

/**
 * Read a single "Item".
 * @param stream Stream to read the item from, must be at the beginning of a word not be EOF or whitespace.
 * @returns A single ReadItem.
 */
function readItem(stream: StringStream): ReadItem {
    if (stream.peekChar() === undefined) {
        throw new TypeError('EOF');
    }
    if (WHITESPACE.includes(stream.peekChar())) {
        throw new TypeError('whitespace should have been stripped');
    }
    const dispatchCharacter = stream.peekChar();
    if (dispatchCharacter === undefined) {
        throw new TypeError(`There should be a dispatch character and if there isn't then the code is wrong`);
    }
    const macro = WORD_DISPATCH_CHARACTERS.get(dispatchCharacter);
    if (macro) {
        return macro(stream);
    } else {
        // Then read a normal word.
        const word: string[] = [stream.readChar()];
        readUntil(/\s/, stream, word);
        return word.join('');
    }
}

/**
 * A reader macro that produces a ReadItem based on a dispatch character.
 * A dispatch character is the character at the beginning of a word.
 */
type ReadMacro = (stream: StringStream) => ReadItem;

const WORD_DISPATCH_CHARACTERS = new Map<string, ReadMacro>();
export type ReadItem = string | MatrixRoomReference | UserID | Keyword | MatrixEventReference;

/**
 * Defines a read macro to produce a read item.
 * @param dispatchCharacter A character at the start of a word that `readItem`
 * should use this macro to produce a `ReadItem` with.
 * @param macro A function that reads a stream and produces a `ReadItem`
 */
function defineReadItem(dispatchCharacter: string, macro: ReadMacro) {
    if (WORD_DISPATCH_CHARACTERS.has(dispatchCharacter)) {
        throw new TypeError(`Read macro already defined for this dispatch character: ${dispatchCharacter}`);
    }
    WORD_DISPATCH_CHARACTERS.set(dispatchCharacter, macro);
}

type PostReadStringReplaceTransformer = (item: string) => ReadItem|string;
type TransformerEntry = { regex: RegExp, transformer: PostReadStringReplaceTransformer };
const POST_READ_TRANSFORMERS = new Map<string, TransformerEntry>();


/**
 * Define a function that will be applied to ReadItem's that are strings that
 * also match the regex.
 * If the regex matches, the transformer function will be called with the read item
 * and given the oppertunity to return a new version of the item.
 *
 * This is mainly used to transform URLs into a MatrixRoomReference.
 */
function definePostReadReplace(regex: RegExp, transformer: PostReadStringReplaceTransformer) {
    if (POST_READ_TRANSFORMERS.has(regex.source)) {
        throw new TypeError(`A transformer has already been defined for the regexp ${regex.source}`);
    }
    POST_READ_TRANSFORMERS.set(regex.source, { regex, transformer })
}

function applyPostReadTransformersToReadItem(item: ReadItem): ReadItem {
    if (typeof item === 'string') {
        for (const [, { regex, transformer }] of POST_READ_TRANSFORMERS) {
            if (regex.test(item)) {
                return transformer(item);
            }
        }
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
function readRoomIDOrAlias(stream: StringStream): MatrixRoomReference|string {
    const word: string[] = [stream.readChar()];
    readUntil(/[:\s]/, stream, word);
    if (stream.peekChar() === undefined || WHITESPACE.includes(stream.peekChar())) {
        return word.join('');
    }
    readUntil(/\s/, stream, word);
    const wholeWord = word.join('');
    if (!isStringRoomID(wholeWord) && !isStringRoomAlias(wholeWord)) {
        return wholeWord;
    }
    return MatrixRoomReference.fromRoomIDOrAlias(wholeWord);
}

/**
 * Read the word as an alias if it is an alias, otherwise it will just return a string token.
 */
defineReadItem('#', readRoomIDOrAlias);
defineReadItem('!', readRoomIDOrAlias);

/**
 * Read the word as a UserID, otherwise return a string if what has been read doesn not represent a user.
 */
defineReadItem('@', (stream: StringStream): UserID|string => {
    const word: string[] = [stream.readChar()];
    readUntil(/[:\s]/, stream, word);
    if (stream.peekChar() === undefined || WHITESPACE.includes(stream.peekChar())) {
        return word.join('');
    }
    readUntil(/\s/, stream, word);
    return new UserID(word.join(''));
})

/**
 * Used for keyword arguments (also known as "options", but this isn't specific enough as it could mean an optional argument).
 * For example `--force`.
 */
export class Keyword {
    /**
     * Creates a Keyword
     * @param designator The designator exluding hyphens.
     */
    constructor(public readonly designator: string) {
        // nothing to do.
    }
}

/**
 * Read a keyword frorm the stream, throws away all of the prefixing `[:-]` characters
 * when producing the keyword designator.
 * @param stream A stream to consume the keyword from.
 * @returns A `Keyword`
 */
function readKeyword(stream: StringStream): Keyword {
    readUntil(/[^-:]/, stream, []);
    if (stream.peekChar() === undefined) {
        return new Keyword('');
    }
    const word: string[] = [stream.readChar()]
    readUntil(/[\s]/, stream, word)
    return new Keyword(word.join(''));
}

defineReadItem('-', readKeyword);
defineReadItem(':', readKeyword);

definePostReadReplace(/^https:\/\/matrix\.to/, input => {
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
            return eventResult.ok;
        }
    } else if (url.userID !== undefined) {
        return new UserID(url.userID);
    } else {
        const roomResult = MatrixRoomReference.fromPermalink(input);
        if (isError(roomResult)) {
            return input;
        } else {
            return roomResult.ok;
        }
    }
})
