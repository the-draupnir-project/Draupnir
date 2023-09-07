/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { randomUUID } from "crypto";
import { CommandError, CommandResult } from "./Validation";
import { LogService } from "matrix-bot-sdk";

export enum CommandExceptionKind {
    /**
     * This class is for exceptions that need to be reported to the user,
     * but are mostly irrelevant to the developers because the behaviour is well
     * understood and expected. These exceptions will never be logged to the error
     * level.
     */
    Known = 'Known',
    /**
     * This class is to be used for reporting unexpected or unknown exceptions
     * that the developers need to know about.
     */
    Unknown = 'Unknown',
}

// FIXME: I wonder if we could allow message to be JSX?
//        Then room references could be put into the DM and actually mean something.
export class CommandException extends CommandError {
    public readonly uuid = randomUUID();

    constructor(
        public readonly exceptionKind: CommandExceptionKind,
        public readonly exception: Error|unknown,
        message: string) {
        super(message)
        this.log();
    }

    public static Result<Ok>(message: string, options: { exception: Error, exceptionKind: CommandExceptionKind }): CommandResult<Ok, CommandException> {
        return CommandResult.Err(new CommandException(options.exceptionKind, options.exception, message));
    }

    protected log(): void {
        const logArguments: Parameters<typeof LogService['info']> = ["CommandException", this.exceptionKind, this.uuid, this.message, this.exception];
        if (this.exceptionKind === CommandExceptionKind.Known) {
            LogService.info(...logArguments);
        } else {
            LogService.error(...logArguments);
        }
    }
}
