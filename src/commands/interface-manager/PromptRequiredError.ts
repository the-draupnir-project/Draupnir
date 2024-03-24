/**
 * Copyright (C) 2023-2024 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionError, ActionResult, ResultError } from "matrix-protection-suite";
import { IArgumentStream, ParameterDescription } from "./ParameterParsing";
import { ReadItem } from "./CommandReader";

export interface PromptContext {
    items: string[],
    designator: string[]
}

export class PromptRequiredError extends ActionError {
    constructor(
        message: string,
        context: string[],
        public readonly parameterRequiringPrompt: ParameterDescription,
        public readonly priorItems: ReadItem[]
    ) {
        super(message, context);
    }

    public static Result(
        message: string,
        { promptParameter, stream }: { promptParameter: ParameterDescription, stream: IArgumentStream }
    ): ActionResult<never, PromptRequiredError> {
        return ResultError(new PromptRequiredError(message, [], promptParameter, stream.priorItems()));
    }
}
