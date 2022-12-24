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

/**
 * When we do move these components into their own library,
 * I'd like to remove the dependency on matrix-bot-sdk.
 */

import { ReadItem } from "./CommandReader";
import { ParamaterParser, ArgumentStream } from "./ParamaterParsing";
import { CommandResult } from "./Validation";

/**
 * 💀 . o O ( at least I don't have to remember the types )
 * https://matrix-client.matrix.org/_matrix/media/r0/download/matrix.org/nbisOFhCcTzNicZrfixWMHZn
 * Probably am "doing something wrong", and no, trying to make this protocol isn't it.
 */

export type BaseFunction = (...args: any) => Promise<CommandResult<any>>;

type CommandLookupEntry<ExecutorType extends BaseFunction> = {
    next?: Map<string, CommandLookupEntry<ExecutorType>>,
    current?: InterfaceCommand<ExecutorType>
};

export class CommandTable<ExecutorType extends BaseFunction> {
    private readonly flattenedCommands = new Set<InterfaceCommand<BaseFunction>>();
    private readonly commands: CommandLookupEntry<ExecutorType> = { };

    constructor() {

    }

    // We use the argument stream so that they can use stream.rest() to get the unconsumed arguments.
    public findAMatchingCommand(stream: ArgumentStream) {
        const tableHelper = (table: CommandLookupEntry<ExecutorType>, argumentStream: ArgumentStream): undefined|InterfaceCommand<ExecutorType> => {
            if (argumentStream.peekItem() === undefined || typeof argumentStream.peekItem() !== 'string') {
                // Then they might be using something like "!mjolnir status"
                return table.current;
            }
            const entry = table.next?.get(argumentStream.readItem() as string);
            if (!entry) {
                // The reason there's no match is because this is the command arguments, rather than subcommand notation.
                return table.current;
            } else {
                return tableHelper(entry, argumentStream);
            }
        };
        return tableHelper(this.commands, stream);
    }

    public internCommand(command: InterfaceCommand<ExecutorType>) {
        const internCommandHelper = (table: CommandLookupEntry<ExecutorType>, designator: string[]): void => {
            if (designator.length === 0) {
                if (table.current) {
                    throw new TypeError(`There is already a command for ${JSON.stringify(designator)}`)
                }
                table.current = command;
                this.flattenedCommands.add(command);
            } else {
                if (table.next === undefined) {
                    table.next = new Map();
                }
                const nextLookupEntry = {};
                table.next!.set(designator.shift()!, nextLookupEntry);
                internCommandHelper(nextLookupEntry, designator);
            }
        }

        internCommandHelper(this.commands, [...command.designator]);
    }
}

const COMMAND_TABLE_TABLE = new Map<string, CommandTable<BaseFunction>>();
export function defineCommandTable(name: string) {
    if (COMMAND_TABLE_TABLE.has(name)) {
        throw new TypeError(`A table called ${name} already exists`);
    }
    COMMAND_TABLE_TABLE.set(name, new CommandTable());
}

export function findCommandTable<ExecutorType extends BaseFunction>(name: string): CommandTable<ExecutorType> {
    const entry = COMMAND_TABLE_TABLE.get(name);
    if (!entry) {
        throw new TypeError(`Couldn't find a table called ${name}`);
    }
    return entry as CommandTable<ExecutorType>;
} 

export class InterfaceCommand<ExecutorType extends BaseFunction> {
    constructor(
        private readonly paramaterParser: ParamaterParser,
        private readonly command: ExecutorType,
        public readonly designator: string[],
    ) {
    }

    // Really, surely this should be part of invoke?
    // probably... it's just that means that invoke has to return the validation result lol.
    // Though this makes no sense if parsing is part of finding a matching command.
    public parseArguments(...args: ReadItem[]): ReturnType<ParamaterParser> {
        return this.paramaterParser(...args);
    }

    public invoke(context: ThisParameterType<ExecutorType>, ...args: Parameters<ExecutorType>): ReturnType<ExecutorType> {
        return this.command.apply(context, args);
    }

    public async parseThenInvoke(context: ThisParameterType<ExecutorType>, ...items: ReadItem[]): Promise<ReturnType<ExecutorType>> {
        const paramaterDescription = this.paramaterParser(...items);
        if (paramaterDescription.isErr()) {
            // The inner type is irrelevant when it is Err, i don't know how to encode this in TS's type system but whatever.
            return paramaterDescription as ReturnType<Awaited<ExecutorType>>;
        }
        return await this.command.apply(context, [...paramaterDescription.ok.immediateArguments, paramaterDescription.ok.rest]);
    }
}

export function defineInterfaceCommand<ExecutorType extends BaseFunction>(description: {
    paramaters: ParamaterParser,
    table: string,
    command: ExecutorType,
    designator: string[],
}) {
    const command = new InterfaceCommand<ExecutorType>(
        description.paramaters,
        description.command,
        description.designator,
    );
    const table = findCommandTable(description.table);
    table.internCommand(command);
    return command;
}
