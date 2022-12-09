/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { UserID } from "matrix-bot-sdk";
import { MatrixRoomReference } from "./MatrixRoomReference";

/**
 * Helper for peeking and reading character by character.
 */
class StringStream {
    private position: number
    /**
     * Makes the super cool string stream.
     * @param source A string to act as the source of the stream.
     * @param start Where in the string we should start reading.
     */
    constructor(private readonly source: string, start = 0) {
        this.position = start;
    }

    public peekChar(eof = undefined) {
        return this.source.at(this.position) ?? eof;
    }

    public readChar(eof = undefined) {
        return this.source.at(this.position++) ?? eof;
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
 * for more efficient (in terms of code) parsing of arguments,
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
    return readCommandFromStream(new StringStream(string));
}

function readCommandFromStream(stream: StringStream): ReadItem[] {
    const words: any[] = [];
    while (stream.peekChar() !== undefined && (eatWhitespace(stream), true) && stream.peekChar() !== undefined) {
        words.push(readItem(stream));
    }
    return words;
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
    if (WHITESPACE.includes(stream.peekChar()!)) {
        throw new TypeError('whitespace should have been stripped');
    }
    const dispatchCharacter = stream.peekChar()!;
    const macro = WORD_DISPATCH_CHARACTERS.get(dispatchCharacter);
    if (macro) {
        return macro(stream);
    } else {
        // Then read a normal word.
        const word: string[] = [stream.readChar()!];
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
export type ReadItem = string | MatrixRoomReference | UserID | Keyword;

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

/**
 * Helper that consumes from `stream` and appends to `output` until a character is peeked matching `regex`. 
 * @param regex A regex for a character to stop at.
 * @param stream A stream to consume from.
 * @param output An array of characters.
 * @returns `output`.
 */
function readUntil(regex: RegExp, stream: StringStream, output: string[]) {
    while (stream.peekChar() !== undefined && !regex.test(stream.peekChar()!)) {
        output.push(stream.readChar()!);
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
    const word: string[] = [stream.readChar()!];
    readUntil(/[:\s]/, stream, word);
    if (stream.peekChar() === undefined || WHITESPACE.includes(stream.peekChar()!)) {
        return word.join('');
    }
    readUntil(/\s/, stream, word);
    return MatrixRoomReference.fromAlias(word.join(''));
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
    const word: string[] = [stream.readChar()!];
    readUntil(/[:\s]/, stream, word);
    if (stream.peekChar() === undefined || WHITESPACE.includes(stream.peekChar()!)) {
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
    const word: string[] = [stream.readChar()!]
    readUntil(/[\s]/, stream, word)
    return new Keyword(word.join(''));
}

defineReadItem('-', readKeyword);
defineReadItem(':', readKeyword);
