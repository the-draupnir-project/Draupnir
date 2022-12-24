/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

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
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

type ValidationMatchExpression<Ok, Err> = { ok?: (ok: Ok) => any, err?: (err: Err) => any};

/**
 * This is a utility specifically for validating user input, and reporting
 * what was wrong back to the end user in a way that makes sense.
 * We are trying to tell the user they did something wrong and what that is.
 * This is something completely different to a normal exception,
 * where we are saying to ourselves that our assumptions in our code about
 * the thing we're doing are completely wrong. The user never
 * should see exceptions as there is nothing they can do about it.
 * 
 * TO be clear this is only used when the user has done something wrong
 * and we need to communicate that. It is not for any other situation.
 */
 export class CommandResult<Ok> {
    private constructor(
        private readonly okValue: Ok|null,
        private readonly errValue: CommandError|null,
    ) {

    }
    public static Ok<Ok>(value: Ok): CommandResult<Ok> {
        return new CommandResult<Ok>(value, null);
    }

    public static Err<Ok>(value: CommandError): CommandResult<Ok> {
        return new CommandResult<Ok>(null, value);
    }

    public async match(expression: ValidationMatchExpression<Ok, CommandError>) {
        return this.okValue ? await expression.ok!(this.ok) : await expression.err!(this.err);
    }

    public isOk(): boolean {
        return this.okValue !== null;
    }

    public isErr(): boolean {
        return this.errValue !== null;
    }

    public get ok(): Ok {
        if (this.isOk()) {
            return this.okValue!;
        } else {
            throw new TypeError("You did not check isOk before accessing ok");
        }
    }

    public get err(): CommandError {
        if (this.isErr()) {
            return this.errValue!;
        } else {
            throw new TypeError("You did not check isErr before accessing err");
        }
    }
}

export class CommandError {
    private static readonly ERROR_CODES = new Map<string, symbol>();

    private constructor(
        public readonly code: symbol,
        public readonly message: string,
    ) {

    }

    private static ensureErrorCode(code: string): symbol {
        const existingCode = CommandError.ERROR_CODES.get(code);
        if (existingCode) {
            return existingCode;
        } else {
            const newCode = Symbol(code);
            CommandError.ERROR_CODES.set(code, newCode);
            return newCode;
        }
    }

    private static findErrorCode(code: string) {
        const existingCode = CommandError.ERROR_CODES.get(code);
        if (existingCode) {
            return existingCode;
        } else {
            throw new TypeError(`No code was registered ${code}`);
        }
    }

    public static Result<Ok>(code: string, message: string): CommandResult<Ok> {
        return CommandResult.Err(this.make(code, message));
    }

    public static make(code: string, message: string) {
        return new CommandError(CommandError.ensureErrorCode(code), message);
    }

    public async match<T>(cases: {[keys: string]: (error: CommandError) => Promise<T>}): Promise<void> {
        for (const [key, handler] of Object.entries(cases)) {
            const keySymbol = CommandError.findErrorCode(key);
            if (this.code === keySymbol) {
                await handler.call(this);
                break;
            }
        }
        const defaultHandler = cases.default;
        if (defaultHandler) {
            await defaultHandler.call(this);
        }
    }
}
