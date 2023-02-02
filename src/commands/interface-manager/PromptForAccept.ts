/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { ParamaterDescription } from "./ParamaterParsing";

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