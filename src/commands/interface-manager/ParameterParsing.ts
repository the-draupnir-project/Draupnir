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

import { ActionError, ActionResult, Ok, ResultError, isError } from "matrix-protection-suite";
import { ISuperCoolStream, Keyword, ReadItem, SuperCoolStream } from "./CommandReader";
import { PromptOptions } from "./PromptForAccept";

export interface IArgumentStream extends ISuperCoolStream<ReadItem[]> {
    rest(): ReadItem[],
    isPromptable(): boolean,
    // should prompt really return a new stream?
    prompt(parameterDescription: ParameterDescription): Promise<ActionResult<ReadItem>>,
}

export class ArgumentStream extends SuperCoolStream<ReadItem[]> implements IArgumentStream {
    public rest() {
        return this.source.slice(this.position);
    }

    public isPromptable(): boolean {
        return false;
    }

    prompt(parameterDescription: ParameterDescription): Promise<ActionResult<ReadItem>> {
        throw new TypeError("This argument stream is NOT promptable, did you even check isPromptable().");
    }
}

// TODO: Presentation types should be extracted to their own file.
// FIXME: PresentationTypes should not be limited to ReadItems.

export type PredicateIsParameter = (readItem: ReadItem) => ActionResult<true>;

export interface PresentationType {
    validator: PredicateIsParameter,
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

export function simpleTypeValidator(name: string, predicate: (readItem: ReadItem) => boolean): PredicateIsParameter {
    return (readItem: ReadItem) => {
        const result = predicate(readItem);
        if (result) {
            return Ok(result);
        } else {
            // How do we accurately denote the type when it includes spaces in its name, same for the read item?
            return ActionError.Result(`Was expecting a match for the presentation type: ${name} but got ${readItem}.`);
        }
    }
}

export function presentationTypeOf(presentation: unknown): PresentationType|undefined {
    // We have no concept of presentation-subtype
    // But we have a top type which is any...
    const candidates = [...PRESENTATION_TYPES.values()]
        .filter(possibleType => possibleType.validator(presentation as ReadItem).isOkay
            && possibleType.name !== 'any'
        );
    if (candidates.length === 0) {
        return undefined;
    } else if (candidates.length === 1) {
        return candidates[0];
    } else {
        // until there are subtype semantics we have to fail early so that we have a chance of knowing
        // that we have a conflicting type.
        throw new TypeError(`presentationTypeof: There are multiple candidates for the presentation ${presentation}: ${JSON.stringify(candidates.map(c => c.name))}`)
    }
}

makePresentationType({
    name: "Keyword",
    validator: simpleTypeValidator("Keyword", (item: ReadItem) => item instanceof Keyword),
});

makePresentationType({
    name: 'string',
    validator: simpleTypeValidator('string', (item: ReadItem) => typeof item === 'string'),
})

makePresentationType({
    name: 'boolean',
    validator: simpleTypeValidator('boolean', (item: ReadItem) => item === 'true' ? true : item === 'false')
})

makePresentationType({
    name: 'any',
    validator: simpleTypeValidator('any', (_item: ReadItem) => true)
})

/**
 * Describes a rest parameter for a command.
 * This consumes any arguments left over in the call to a command
 * into an array and ensures that each can be accepted by the `acceptor`.
 *
 * Any keywords in the rest of the command will be given to the `keywordParser`.
 */
export class RestDescription<ExecutorContext = unknown> implements ParameterDescription {
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
     * @returns A ActionResult of ReadItems associated with the rest of the command.
     * If a ReadItem or Keyword is invalid for the command, then an error will be returned.
     */
    public async parseRest(stream: IArgumentStream, promptForRest: boolean, keywordParser: KeywordParser): Promise<ActionResult<ReadItem[]>> {
        const items: ReadItem[] = [];
        if (this.prompt && promptForRest && stream.isPromptable() && stream.peekItem() === undefined) {
            const result = await stream.prompt(this);
            if (isError(result)) {
                return result;
            }
        }
        while (stream.peekItem() !== undefined) {
            const keywordResult = keywordParser.parseKeywords(stream);
            if (isError(keywordResult)) {
                return keywordResult;
            }
            if (stream.peekItem() !== undefined) {
                const validationResult = this.acceptor.validator(stream.peekItem());
                if (isError(validationResult)) {
                    return ArgumentParseError.Result(
                        validationResult.error.message,
                        { parameter: this, stream }
                    );
                }
                items.push(stream.readItem());
            }
        }
        return Ok(items);
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
 * An extension of ParameterDescription, some keyword arguments
 * may just be flags that have no associated property in syntax,
 * and their presence is to associate the value `true`.
 */
interface KeywordPropertyDescription extends ParameterDescription {
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


    private readKeywordAssociatedProperty(keyword: KeywordPropertyDescription, itemStream: IArgumentStream): ActionResult<any, ArgumentParseError> {
        if (itemStream.peekItem() !== undefined && !(itemStream.peekItem() instanceof Keyword)) {
            const validationResult = keyword.acceptor.validator(itemStream.peekItem());
            if (validationResult.isOkay) {
                return Ok(itemStream.readItem());
            } else {
                return ArgumentParseError.Result(validationResult.error.message, { parameter: keyword, stream: itemStream });
            }
        } else {
            if (!keyword.isFlag) {
                return ArgumentParseError.Result(`An associated argument was not provided for the keyword ${keyword.name}.`, { parameter: keyword, stream: itemStream });
            } else {
                return Ok(true);
            }
        }
    }

    public parseKeywords(itemStream: IArgumentStream): ActionResult<this> {
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
                if (isError(associatedPropertyResult)) {
                    return associatedPropertyResult;
                } else {
                    this.arguments.set(description.name, associatedPropertyResult.ok);
                }
            }

        }
        return Ok(this);
    }

    public async parseRest(stream: IArgumentStream, shouldPromptForRest = false, restDescription?: RestDescription): Promise<ActionResult<ReadItem[]|undefined>> {
        if (restDescription !== undefined) {
            return await restDescription.parseRest(stream, shouldPromptForRest, this)
        } else {
            const result = this.parseKeywords(stream);
            if (isError(result)) {
                return result;
            }
            if (stream.peekItem() !== undefined) {
                return ActionError.Result(`There is an unexpected non-keyword argument ${JSON.stringify(stream.peekItem())}`);
            } else {
                return Ok(undefined);
            }
        }
    }
}

export interface ParsedArguments {
    readonly immediateArguments: ReadItem[],
    readonly rest?: ReadItem[],
    readonly keywords: ParsedKeywords,
}

export type Prompt<ExecutorContext> =  (this: ExecutorContext, description: ParameterDescription<ExecutorContext>) => Promise<PromptOptions>;

export interface ParameterDescription<ExecutorContext = unknown> {
    name: string,
    description?: string,
    acceptor: PresentationType,
    /**
     * Prompt the interface for an argument that was not provided.
     * @param this Expected to be the executor context that is used to provided to the command executor.
     * @param description The parameter description being accepted.
     * @returns PromptOptions, to be handled by the interface adaptor.
     */
    prompt?: Prompt<ExecutorContext>,
}

export type ParameterParser = (stream: IArgumentStream) => Promise<ActionResult<ParsedArguments>>;

// So this should really just be something used by defineInterfaceCommand which turns parameters into a validator that can be used.
// It can't be, because then otherwise how does the semantics for union work?
// We should have a new type of ActionResult that accepts a ParamterDescription, and can render what's wrong (e.g. missing parameter).
// Showing where in the item stream it is missing and the command syntax and everything lovely like that.
// How does that work with Union?
export function parameters(descriptions: ParameterDescription[], rest: undefined|RestDescription = undefined, keywords: KeywordsDescription = new KeywordsDescription({}, false)): IArgumentListParser {
    return new ArgumentListParser(descriptions, keywords, rest);
}

export interface IArgumentListParser {
    readonly parse: ParameterParser,
    readonly descriptions: ParameterDescription[],
    readonly rest?: RestDescription,
    readonly keywords: KeywordsDescription,
}

/**
 * Allows an interface adaptor to parse arguments to a command using the command description
 * before being able to invoke a command.
 */
class ArgumentListParser implements IArgumentListParser {
    constructor(
        public readonly descriptions: ParameterDescription[],
        public readonly keywords: KeywordsDescription,
        public readonly rest?: RestDescription,
    ) {
    }

    public async parse(stream: IArgumentStream): Promise<ActionResult<ParsedArguments>> {
        let hasPrompted = false;
        const keywordsParser = this.keywords.getParser();
        for (const parameter of this.descriptions) {
            // it eats any keywords at any point in the stream
            // as they can appear at any point technically.
            const keywordResult = keywordsParser.parseKeywords(stream);
            if (isError(keywordResult)) {
                return keywordResult;
            }
            if (stream.peekItem() === undefined) {
                if (parameter.prompt && stream.isPromptable()) {
                    const promptResult = await stream.prompt(parameter);
                    if (isError(promptResult)) {
                        return promptResult;
                    }
                    hasPrompted = true;
                } else {
                    return ArgumentParseError.Result(
                        `An argument for the parameter ${parameter.name} was expected but was not provided.`,
                        { parameter, stream }
                    );
                }
            }
            const result = parameter.acceptor.validator(stream.peekItem());
            if (isError(result)) {
                return ArgumentParseError.Result(result.error.message, { parameter, stream });
            }
            stream.readItem();
        }
        const restResult = await keywordsParser.parseRest(stream, hasPrompted, this.rest);
        if (isError(restResult)) {
            return restResult;
        }
        const immediateArguments = restResult.ok === undefined
            || restResult.ok.length === 0
            ? stream.source
            : stream.source.slice(0, stream.source.indexOf(restResult.ok[0]))
        return Ok({
            immediateArguments: immediateArguments,
            keywords: keywordsParser.getKeywords(),
            rest: restResult.ok
        });
    }
}

export class AbstractArgumentParseError extends ActionError {
    constructor(
        public readonly stream: IArgumentStream,
        message: string) {
        super(message)
    }

    public static Result(message: string, options: { stream: IArgumentStream }): ActionResult<never, AbstractArgumentParseError> {
        return ResultError(new AbstractArgumentParseError(options.stream, message));
    }
}

export class ArgumentParseError extends AbstractArgumentParseError {
    constructor(
        public readonly parameter: ParameterDescription,
        stream: IArgumentStream,
        message: string) {
        super(stream, message)
    }

    public static Result<Ok>(message: string, options: { parameter: ParameterDescription, stream: IArgumentStream }): ActionResult<Ok, ArgumentParseError> {
        return ResultError(new ArgumentParseError(options.parameter, options.stream, message));
    }
}

export class UnexpectedArgumentError extends AbstractArgumentParseError {
    public static Result<Ok>(message: string, options: { stream: IArgumentStream }): ActionResult<Ok, UnexpectedArgumentError> {
        return ResultError(new UnexpectedArgumentError(options.stream, message));
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
            if (presentationTypes.some(p => p.validator(readItem).isOkay)) {
                return Ok(true);
            } else {
                return ActionError.Result(`Read item didn't match any of the presentaiton types ${name}`);
            }
        }
    }
}
