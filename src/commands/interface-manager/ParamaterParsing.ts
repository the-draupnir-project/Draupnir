/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * Which includes the following license notice:
 *
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, or committed under the Apache License.
 */

import { ISuperCoolStream, Keyword, ReadItem, SuperCoolStream } from "./CommandReader";
import { PromptOptions } from "./PromptForAccept";
import { CommandError, CommandResult } from "./Validation";

export interface IArgumentStream extends ISuperCoolStream<ReadItem[]> {
    rest(): ReadItem[],
    isPromptable(): boolean,
    // should prompt really return a new stream?
    prompt(paramaterDescription: ParamaterDescription): Promise<CommandResult<ReadItem>>,
}

export class ArgumentStream extends SuperCoolStream<ReadItem[]> implements IArgumentStream {
    public rest() {
        return this.source.slice(this.position);
    }

    public isPromptable(): boolean {
        return false;
    }

    prompt(paramaterDescription: ParamaterDescription): Promise<CommandResult<ReadItem>> {
        throw new TypeError("This argument stream is NOT promptable, did you even check isPromptable().");
    }
}

// TODO: Presentation types should be extracted to their own file.
// FIXME: PresentationTypes should not be limited to ReadItems.

export type PredicateIsParamater = (readItem: ReadItem) => CommandResult<true>;

export interface PresentationType {
    validator: PredicateIsParamater,
    name: string,
}

const PRESENTATION_TYPES = new Map</* the name of the presentation type. */string, PresentationType>();

export function findPresentationType(name: string): PresentationType {
    const entry = PRESENTATION_TYPES.get(name);
    if (entry) {
        return entry;
    } else {
        throw new TypeError(`presentation type with the name: ${name} was not registered`);
    }
}

export function registerPresentationType(name: string, presentationType: PresentationType): void {
    if (PRESENTATION_TYPES.has(name)) {
        throw new TypeError(`presentation type with the name: ${name} has already been registered`);
    }
    PRESENTATION_TYPES.set(name, presentationType);
}

export function makePresentationType(description: PresentationType) {
    registerPresentationType(description.name, description);
    return description;
}

export function simpleTypeValidator(name: string, predicate: (readItem: ReadItem) => boolean): PredicateIsParamater {
    return (readItem: ReadItem) => {
        const result = predicate(readItem);
        if (result) {
            return CommandResult.Ok(result);
        } else {
            // How do we accurately denote the type when it includes spaces in its name, same for the read item?
            return CommandError.Result(`Was expecting a match for the presentation type: ${name} but got ${readItem}.`);
        }
    }
}

export function presentationTypeOf(presentation: unknown): PresentationType|undefined {
    return [...PRESENTATION_TYPES.values()]
        .find(possibleType => possibleType.validator(presentation as ReadItem).isOk());
}

makePresentationType({
    name: "Keyword",
    validator: simpleTypeValidator("Keyword", (item: ReadItem) => item instanceof Keyword),
});

makePresentationType({
    name: 'string',
    validator: simpleTypeValidator('string', (item: ReadItem) => typeof item === 'string'),
})

/**
 * Describes a rest paramater for a command.
 * This consumes any arguments left over in the call to a command
 * into an array and ensures that each can be accepted by the `acceptor`.
 *
 * Any keywords in the rest of the command will be given to the `keywordParser`.
 */
export class RestDescription<ExecutorContext = unknown> implements ParamaterDescription {
    constructor(
        public readonly name: string,
        /** The presentation type of each item. */
        public readonly acceptor: PresentationType,
        public readonly prompt?: Prompt<ExecutorContext>,
        public readonly description?: string,
    ) {

    }

    /**
     * Parse the rest of a command.
     * @param stream An argument stream that starts at the rest of a command.
     * @param keywordParser Used to store any keywords found in the rest of the command.
     * @returns A CommandResult of ReadItems associated with the rest of the command.
     * If a ReadItem or Keyword is invalid for the command, then an error will be returned.
     */
    public async parseRest(stream: IArgumentStream, promptForRest: boolean, keywordParser: KeywordParser): Promise<CommandResult<ReadItem[]>> {
        const items: ReadItem[] = [];
        if (this.prompt && promptForRest && stream.isPromptable() && stream.peekItem() === undefined) {
            const result = await stream.prompt(this);
            if (result.isErr()) {
                return result as any;
            }
        }
        while (stream.peekItem() !== undefined) {
            const keywordResult = keywordParser.parseKeywords(stream);
            if (keywordResult.isErr()) {
                return CommandResult.Err(keywordResult.err);
            }
            if (stream.peekItem() !== undefined) {
                const validationResult = this.acceptor.validator(stream.peekItem());
                if (validationResult.isErr()) {
                    return ArgumentParseError.Result(
                        validationResult.err.message,
                        { paramater: this, stream }
                    );
                }
                items.push(stream.readItem());
            }
        }
        return CommandResult.Ok(items);
    }
}

/**
 * This is an interface for an object which describes which keyword
 * argument that can be accepted by a command.
 */
interface KeywordArgumentsDescription {
    readonly [prop: string]: KeywordPropertyDescription|undefined;
}

/**
 * An extension of ParamaterDescription, some keyword arguments
 * may just be flags that have no associated property in syntax,
 * and their presence is to associate the value `true`.
 */
interface KeywordPropertyDescription extends ParamaterDescription {
    readonly isFlag: boolean;
}

/**
 * Describes all of the keyword arguments for a command.
 */
export class KeywordsDescription {
    constructor(
        public readonly description: KeywordArgumentsDescription,
        public readonly allowOtherKeys?: boolean,
    ) {

    }

    /**
     * @returns A parser that will create a map of all keywords and their associated properties.
     */
    public getParser(): KeywordParser {
        return new KeywordParser(this);
    }
}

/**
 * A read only map of keywords to their associated properties.
 */
export class ParsedKeywords {
    constructor (
        private readonly descriptions: KeywordArgumentsDescription,
        private readonly keywords: ReadonlyMap<string, ReadItem>
    ) {

    }

    public getKeyword<T extends ReadItem|boolean>(keyword: string, defaultValue: T|undefined = undefined): T|undefined {
        const keywordDescription = this.descriptions[keyword];
        if (keywordDescription === undefined) {
            throw new TypeError(`${keyword} is not a keyword that has been expected for this command.`);
        }
        const value = this.keywords.get(keyword);
        if (value !== undefined) {
            return value as T;
        } else {
            return defaultValue;
        }
    }
}

/**
 * A helper that gets instantiated for each command invoccation to parse and build
 * the map representing the association between keywords and their properties.
 */
class KeywordParser {
    private readonly arguments = new Map<string, ReadItem>();

    constructor(
        public readonly description: KeywordsDescription
    ) {
    }

    public getKeywords(): ParsedKeywords {
        return new ParsedKeywords(this.description.description, this.arguments);
    }


    private readKeywordAssociatedProperty(keyword: KeywordPropertyDescription, itemStream: IArgumentStream): CommandResult<any, ArgumentParseError> {
        if (itemStream.peekItem() !== undefined && !(itemStream.peekItem() instanceof Keyword)) {
            const validationResult = keyword.acceptor.validator(itemStream.peekItem());
            if (validationResult.isOk()) {
                return CommandResult.Ok(itemStream.readItem());
            } else {
                return ArgumentParseError.Result(validationResult.err.message, { paramater: keyword, stream: itemStream });
            }
        } else {
            if (!keyword.isFlag) {
                return ArgumentParseError.Result(`An associated argument was not provided for the keyword ${keyword.name}.`, { paramater: keyword, stream: itemStream });
            } else {
                return CommandResult.Ok(true);
            }
        }
    }

    public parseKeywords(itemStream: IArgumentStream): CommandResult<this> {
        while (itemStream.peekItem() !== undefined && itemStream.peekItem() instanceof Keyword) {
            const item = itemStream.readItem() as Keyword;
            const description = this.description.description[item.designator];
            if (description === undefined) {
                if (this.description.allowOtherKeys) {
                    throw new TypeError("Allow other keys is umimplemented");
                    // i don't think this can be implemented,
                    // how do you tell an extra key is a flag or has an associated
                    // property?
                } else {
                    return UnexpectedArgumentError.Result(
                        `Encountered unexpected keyword argument: ${item.designator}`,
                        { stream: itemStream }
                    );
                }
            } else {
                const associatedPropertyResult = this.readKeywordAssociatedProperty(description, itemStream);
                if (associatedPropertyResult.isErr()) {
                    return associatedPropertyResult;
                } else {
                    this.arguments.set(description.name, associatedPropertyResult.ok);
                }
            }

        }
        return CommandResult.Ok(this);
    }

    public async parseRest(stream: IArgumentStream, shouldPromptForRest = false, restDescription?: RestDescription): Promise<CommandResult<ReadItem[]|undefined>> {
        if (restDescription !== undefined) {
            return await restDescription.parseRest(stream, shouldPromptForRest, this)
        } else {
            const result = this.parseKeywords(stream);
            if (result.isErr()) {
                return CommandResult.Err(result.err);
            }
            if (stream.peekItem() !== undefined) {
                return CommandError.Result(`There is an unexpected non-keyword argument ${JSON.stringify(stream.peekItem())}`);
            } else {
                return CommandResult.Ok(undefined);
            }
        }
    }
}

export interface ParsedArguments {
    readonly immediateArguments: ReadItem[],
    readonly rest?: ReadItem[],
    readonly keywords: ParsedKeywords,
}

export type Prompt<ExecutorContext> =  (this: ExecutorContext, description: ParamaterDescription<ExecutorContext>) => Promise<PromptOptions>;

export interface ParamaterDescription<ExecutorContext = unknown> {
    name: string,
    description?: string,
    acceptor: PresentationType,
    /**
     * Prompt the interface for an argument that was not provided.
     * @param this Expected to be the executor context that is used to provided to the command executor.
     * @param description The paramater description being accepted.
     * @returns PromptOptions, to be handled by the interface adaptor.
     */
    prompt?: Prompt<ExecutorContext>,
}

export type ParamaterParser = (stream: IArgumentStream) => Promise<CommandResult<ParsedArguments>>;

// So this should really just be something used by defineInterfaceCommand which turns paramaters into a validator that can be used.
// It can't be, because then otherwise how does the semantics for union work?
// We should have a new type of CommandResult that accepts a ParamterDescription, and can render what's wrong (e.g. missing paramater).
// Showing where in the item stream it is missing and the command syntax and everything lovely like that.
// How does that work with Union?
export function paramaters(descriptions: ParamaterDescription[], rest: undefined|RestDescription = undefined, keywords: KeywordsDescription = new KeywordsDescription({}, false)): IArgumentListParser {
    return new ArgumentListParser(descriptions, keywords, rest);
}

export interface IArgumentListParser {
    readonly parse: ParamaterParser,
    readonly descriptions: ParamaterDescription[],
    readonly rest?: RestDescription,
    readonly keywords: KeywordsDescription,
}

/**
 * Allows an interface adaptor to parse arguments to a command using the command description
 * before being able to invoke a command.
 */
class ArgumentListParser implements IArgumentListParser {
    constructor(
        public readonly descriptions: ParamaterDescription[],
        public readonly keywords: KeywordsDescription,
        public readonly rest?: RestDescription,
    ) {
    }

    public async parse(stream: IArgumentStream): Promise<CommandResult<ParsedArguments>> {
        let hasPrompted = false;
        const keywordsParser = this.keywords.getParser();
        for (const paramater of this.descriptions) {
            // it eats any keywords at any point in the stream
            // as they can appear at any point technically.
            const keywordResult = keywordsParser.parseKeywords(stream);
            if (keywordResult.isErr()) {
                return CommandResult.Err(keywordResult.err);
            }
            if (stream.peekItem() === undefined) {
                if (stream.isPromptable()) {
                    const promptResult = await stream.prompt(paramater);
                    if (promptResult.isErr()) {
                        return promptResult as any;
                    }
                    hasPrompted = true;
                } else {
                    return ArgumentParseError.Result(
                        `An argument for the paramater ${paramater.name} was expected but was not provided.`,
                        { paramater, stream }
                    );
                }
            }
            const result = paramater.acceptor.validator(stream.peekItem());
            if (result.isErr()) {
                return ArgumentParseError.Result(result.err.message, { paramater, stream });
            }
            stream.readItem();
        }
        const restResult = await keywordsParser.parseRest(stream, hasPrompted, this.rest);
        if (restResult.isErr()) {
            return CommandResult.Err(restResult.err);
        }
        const immediateArguments = restResult.ok === undefined
            || restResult.ok.length === 0
            ? stream.source
            : stream.source.slice(0, stream.source.indexOf(restResult.ok[0]) + 1)
        return CommandResult.Ok({
            immediateArguments: immediateArguments,
            keywords: keywordsParser.getKeywords(),
            rest: restResult.ok
        });
    }
}

export class AbstractArgumentParseError extends CommandError {
    constructor(
        public readonly stream: IArgumentStream,
        message: string) {
        super(message)
    }

    public static Result<Ok>(message: string, options: { stream: IArgumentStream }): CommandResult<Ok, AbstractArgumentParseError> {
        return CommandResult.Err(new AbstractArgumentParseError(options.stream, message));
    }
}

export class ArgumentParseError extends AbstractArgumentParseError {
    constructor(
        public readonly paramater: ParamaterDescription,
        stream: IArgumentStream,
        message: string) {
        super(stream, message)
    }

    public static Result<Ok>(message: string, options: { paramater: ParamaterDescription, stream: IArgumentStream }): CommandResult<Ok, ArgumentParseError> {
        return CommandResult.Err(new ArgumentParseError(options.paramater, options.stream, message));
    }
}

export class UnexpectedArgumentError extends AbstractArgumentParseError {
    public static Result<Ok>(message: string, options: { stream: IArgumentStream }): CommandResult<Ok, UnexpectedArgumentError> {
        return CommandResult.Err(new UnexpectedArgumentError(options.stream, message));
    }
}

/**
 * I don't think we should use `union` and it should be replaced by a presentationTypeTranslator
 * these are specific to applications e.g. imagine you want to resolve an alias or something.
 * It oculd also work by making an anonymous presentation type, but dunno about that.
 */
export function union(...presentationTypes: PresentationType[]): PresentationType {
    const name = presentationTypes.map(type => type.name).join(" | ");
    return {
        name,
        validator: (readItem: ReadItem) => {
            if (presentationTypes.some(p => p.validator(readItem).isOk())) {
                return CommandResult.Ok(true);
            } else {
                return CommandError.Result(`Read item didn't match any of the presentaiton types ${name}`);
            }
        }
    }
}
