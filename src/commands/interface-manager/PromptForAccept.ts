/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ReadItem } from "./CommandReader";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { ArgumentStream, ParameterDescription } from "./ParameterParsing";
import { CommandResult } from "./Validation";

export interface PromptOptions<PresentationType = any> {
    readonly suggestions: PresentationType[]
    readonly default?: PresentationType
}

/**
 * The idea is that the InterfaceAcceptor can use the presentation type
 * to derive the prompt, or use the prompt given by the ParameterDescription.
 */
export interface InterfaceAcceptor<PresentationType = any> {
    readonly isPromptable: boolean
    promptForAccept(parameter: ParameterDescription, invocationRecord: CommandInvocationRecord): Promise<CommandResult<PresentationType>>
}

export interface CommandInvocationRecord {
    readonly command: InterfaceCommand<BaseFunction>,
}

export class PromptableArgumentStream extends ArgumentStream {
    constructor(
        source: ReadItem[],
        private readonly interfaceAcceptor: InterfaceAcceptor,
        private readonly invocationRecord: CommandInvocationRecord,
        start = 0,
    ) {
        super([...source], start);
    }
    public rest() {
        return this.source.slice(this.position);
    }

    public isPromptable(): boolean {
        return this.interfaceAcceptor.isPromptable
    }

    public async prompt<T = ReadItem>(parameterDescription: ParameterDescription): Promise<CommandResult<T>> {
        const result = await this.interfaceAcceptor.promptForAccept(
            parameterDescription,
            this.invocationRecord
        );
        if (result.isOk()) {
            this.source.push(result.ok);
        }
        return result;
    }
}
