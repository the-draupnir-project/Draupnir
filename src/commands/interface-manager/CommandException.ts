/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { randomUUID } from "crypto";
import { CommandError, CommandResult } from "./Validation";
import { trace } from "../../utils";

// FIXME: I wonder if we could allow message to be JSX?
//        Then room references could be put into the DM and actually mean something.
export class CommandException extends CommandError {
    public readonly uuid = randomUUID();

    constructor(
        public readonly exception: Error | unknown,
        message: string) {
        super(message)
    }

    @trace
    public static Result<Ok>(message: string, options: { exception: Error }): CommandResult<Ok, CommandException> {
        return CommandResult.Err(new CommandException(options.exception, message));
    }
}
