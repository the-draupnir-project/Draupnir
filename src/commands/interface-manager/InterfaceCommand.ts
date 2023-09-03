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

import { trace } from "../../utils";
import { ParameterParser, IArgumentStream, IArgumentListParser, ParsedKeywords, ArgumentStream } from "./ParameterParsing";
import { CommandResult } from "./Validation";

/**
 * 💀 . o O ( at least I don't have to remember the types )
 * https://matrix-client.matrix.org/_matrix/media/r0/download/matrix.org/nbisOFhCcTzNicZrfixWMHZn
 * Probably am "doing something wrong", and no, trying to make this protocol isn't it.
 */

export type BaseFunction = (keywords: ParsedKeywords, ...args: any) => Promise<CommandResult<any>>;

type CommandLookupEntry<ExecutorType extends BaseFunction> = {
    next?: Map<string, CommandLookupEntry<ExecutorType>>,
    current?: InterfaceCommand<ExecutorType>
};

export class CommandTable<ExecutorType extends BaseFunction = BaseFunction> {
    private readonly flattenedCommands = new Set<InterfaceCommand<BaseFunction>>();
    private readonly commands: CommandLookupEntry<ExecutorType> = {};
    /** Imported tables are tables that "add commands" to this table. They are not sub commands. */
    private readonly importedTables = new Set<CommandTable>();

    constructor(public readonly name: string | symbol) {

    }

    /**
     * Used to render the help command.
     * @returns All of the commands in this table.
     */
    @trace
    public getAllCommands(): InterfaceCommand[] {
        const importedCommands = [...this.importedTables].reduce((acc, t) => [...acc, ...t.getAllCommands()], []);
        return [...this.getExportedCommands(), ...importedCommands]
    }

    /**
     * @returns Only the commands interned in this table, excludes imported commands.
     */
    @trace
    public getExportedCommands(): InterfaceCommand[] {
        return [...this.flattenedCommands.values()];
    }

    @trace
    public getImportedTables(): CommandTable[] {
        return [...this.importedTables];
    }

    // We use the argument stream so that they can use stream.rest() to get the unconsumed arguments.
    @trace
    public findAnExportedMatchingCommand(stream: IArgumentStream) {
        const tableHelper = (table: CommandLookupEntry<ExecutorType>, argumentStream: IArgumentStream): undefined | InterfaceCommand<ExecutorType> => {
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

    @trace
    public findAMatchingCommand(stream: IArgumentStream): InterfaceCommand | undefined {
        const possibleExportedCommand = stream.savingPositionIf({
            body: (s: IArgumentStream) => this.findAnExportedMatchingCommand(s),
            predicate: command => command === undefined,
        });
        if (possibleExportedCommand) {
            return possibleExportedCommand;
        }
        for (const table of this.importedTables.values()) {
            const possibleCommand: InterfaceCommand | undefined = stream.savingPositionIf<InterfaceCommand | undefined>({
                body: (s: IArgumentStream) => table.findAMatchingCommand(s),
                predicate: command => command === undefined,
            });
            if (possibleCommand) {
                return possibleCommand;
            }
        }
        return undefined;
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
                const currentDesignator = designator.shift()!;
                const nextLookupEntry = table.next.get(currentDesignator)
                    ?? ((lookup: CommandLookupEntry<ExecutorType>) => (table.next?.set(currentDesignator, lookup), lookup))({});
                internCommandHelper(nextLookupEntry, designator);
            }
        }

        internCommandHelper(this.commands, [...command.designator]);
    }

    @trace
    public importTable(table: CommandTable): void {
        for (const command of table.getAllCommands()) {
            if (this.findAMatchingCommand(new ArgumentStream(command.designator))) {
                throw new TypeError(`Command ${JSON.stringify(command.designator)} is in conflict with this table and cannot be imported.`);
            }
        }
        this.importedTables.add(table);
    }
}

const COMMAND_TABLE_TABLE = new Map<string | symbol, CommandTable<BaseFunction>>();
export function defineCommandTable(name: string | symbol): CommandTable {
    if (COMMAND_TABLE_TABLE.has(name)) {
        throw new TypeError(`A table called ${name.toString()} already exists`);
    }
    const table = new CommandTable(name);
    COMMAND_TABLE_TABLE.set(name, table);
    return table;
}

export function findCommandTable<ExecutorType extends BaseFunction>(name: string | symbol): CommandTable<ExecutorType> {
    const entry = COMMAND_TABLE_TABLE.get(name);
    if (!entry) {
        throw new TypeError(`Couldn't find a table called ${name.toString()}`);
    }
    return entry as CommandTable<ExecutorType>;
}

/**
 * Used to find a table command at the internal DSL level, not as a client for commands.
 */
export function findTableCommand<ExecutorType extends BaseFunction>(tableName: string | symbol, ...designator: string[]): InterfaceCommand<ExecutorType> {
    const table = findCommandTable(tableName);
    const command = table.findAMatchingCommand(new ArgumentStream(designator));
    if (command === undefined || !designator.every(part => command.designator.includes(part))) {
        throw new TypeError(`Could not find a table command in the table ${tableName.toString()} with the designator ${JSON.stringify(designator)}`)
    }
    return command as InterfaceCommand<ExecutorType>;
}

export class InterfaceCommand<ExecutorType extends BaseFunction = BaseFunction> {
    constructor(
        public readonly argumentListParser: IArgumentListParser,
        private readonly command: ExecutorType,
        public readonly designator: string[],
        /** A short one line summary of what the command does to display alongside it's help */
        public readonly summary: string,
        /** A longer description that goes into detail. */
        public readonly description?: string,
    ) {
    }

    // Really, surely this should be part of invoke?
    // probably... it's just that means that invoke has to return the validation result lol.
    // Though this makes no sense if parsing is part of finding a matching command.
    @trace
    public async parseArguments(stream: IArgumentStream): ReturnType<ParameterParser> {
        return await this.argumentListParser.parse(stream);
    }

    public invoke(context: ThisParameterType<ExecutorType>, ...args: Parameters<ExecutorType>): ReturnType<ExecutorType> {
        return this.command.apply(context, args);
    }

    @trace
    public async parseThenInvoke(context: ThisParameterType<ExecutorType>, stream: IArgumentStream): Promise<ReturnType<ExecutorType>> {
        const parameterDescription = await this.parseArguments(stream);
        if (parameterDescription.isErr()) {
            // The inner type is irrelevant when it is Err, i don't know how to encode this in TS's type system but whatever.
            return parameterDescription as ReturnType<Awaited<ExecutorType>>;
        }
        return await this.command.apply(context, [
            parameterDescription.ok.keywords,
            ...parameterDescription.ok.immediateArguments,
            ...parameterDescription.ok.rest ?? []
        ]);
    }
}

// Shouldn't there be a callback interface.
// imagine the old ban or sync command, each time you check a room
// you add a callback to say when a user has been banned or a room
// has been cleared or there was an error applying a ban to that room.
// There could be a description in defineInterfaceComomand
// for what each callback is and does for the adaptors to hook into.
export function defineInterfaceCommand<ExecutorType extends BaseFunction>(description: {
    parameters: IArgumentListParser,
    table: string | symbol,
    command: ExecutorType,
    designator: string[],
    summary: string,
    description?: string,
}) {
    const command = new InterfaceCommand<ExecutorType>(
        description.parameters,
        description.command,
        description.designator,
        description.summary,
        description.description,
    );
    const table = findCommandTable(description.table);
    table.internCommand(command);
    return command;
}
