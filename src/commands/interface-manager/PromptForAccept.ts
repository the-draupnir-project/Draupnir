/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ReadItem } from "./CommandReader";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { ArgumentStream, ParamaterDescription } from "./ParamaterParsing";

export interface PromptOptions<PresentationType = any> {
    readonly suggestions: PresentationType[]
    readonly default?: PresentationType
}

export type Prompt<Context = any> = (this: Context, description: ParamaterDescription) => Promise<PromptOptions>

/**
 * The idea is that the InterfaceAcceptor can use the presentation type
 * to derive the prompt, or use the prompt given by the ParamaterDescription.
 */
export interface InterfaceAcceptor<PresentationType = any> {
    readonly isPromptable: boolean
    promptForAccept(paramater: ParamaterDescription, invocationRecord: CommandInvocationRecord): Promise<PresentationType>
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

    public async prompt<T = ReadItem>(paramaterDescription: ParamaterDescription): Promise<void> {
        // FIXME I thought prompt for accept could return multiple items if there were
        // othere paramaters after this one, but never mind..
        this.source.push(await this.interfaceAcceptor.promptForAccept(
            paramaterDescription,
            this.invocationRecord
        ));
    }
}
