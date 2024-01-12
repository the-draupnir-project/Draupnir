/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ReadItem } from "./CommandReader";
import { ArgumentStream } from "./ParameterParsing";

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
}

export class PromptableArgumentStream extends ArgumentStream {
    constructor(
        source: ReadItem[],
        private readonly interfaceAcceptor: InterfaceAcceptor,
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
}
