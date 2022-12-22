/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 */

import { ParamaterParser, ArgumentStream } from "./ParamaterParsing";

export type BaseFunction = (...args: any) => Promise<any>;

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

class InterfaceCommand<ExecutorType extends BaseFunction> {
    constructor(
        private readonly paramaterParser: ParamaterParser,
        private readonly command: ExecutorType,
        public readonly designator: string[],
    ) {
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
