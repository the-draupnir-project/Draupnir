// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "crypto";
import { ActionError, ResultError, ActionResult } from "./Action";
import { Logger } from "../Logging/Logger";

const log = new Logger("ActionException");

/**
 * A way to catagorise different Exceptions.
 */
export enum ActionExceptionKind {
  /**
   * This kind is for exceptions that need to be reported to the user,
   * but are mostly irrelevant to the developers because the behaviour is well
   * understood and expected. These exceptions will never be logged to the error
   * level.
   */
  Known = "Known",
  /**
   * This kind is to be used for reporting unexpected or unknown exceptions
   * that the developers need to know about.
   */
  Unknown = "Unknown",
}

// TODO: I wonder if we could allow message to be JSX?
/**
 * `ActionExceptions` are used to convert throwables into `ActionError`s.
 * Each `ActionException` is given a unique identifier and is logged immediatley
 * (depending on {@link ActionExceptionKind}).
 *
 * You will want to create these using {@link ActionException.Result}.
 */
export class ActionException extends ActionError {
  public readonly uuid: ReturnType<typeof randomUUID>;

  constructor(
    public readonly exceptionKind: ActionExceptionKind,
    // make a call to only allow Error in a moment.
    public readonly exception: unknown,
    message: string,
    {
      uuid = randomUUID(),
      suppressLog = false,
      elaborations = [],
    }: {
      uuid?: ReturnType<typeof randomUUID>;
      suppressLog?: boolean;
      elaborations?: string[];
    } = {}
  ) {
    super(message, elaborations);
    this.uuid = uuid;
    if (!suppressLog) {
      this.log();
    }
  }

  /**
   * Convienant factory method for `ActionException`s that will return an
   * `ActionResult`.
   * @param message The message for the `ActionError` that concisely describes the problem.
   * @param options.exception The `Error` that was thrown.
   * @param options.exceptionKind The `ActionExceptionKind` that catagorieses the exception.
   * @returns An `ActionResult` with the exception as the `Error` value.
   */
  public static Result(
    message: string,
    options: { exception: unknown; exceptionKind: ActionExceptionKind }
  ): ActionResult<never, ActionException> {
    return ResultError(
      new ActionException(options.exceptionKind, options.exception, message)
    );
  }

  protected log(): void {
    const logArguments: Parameters<InstanceType<typeof Logger>["info"]> = [
      "ActionException",
      this.exceptionKind,
      this.uuid,
      this.message,
      this.exception,
    ];
    if (this.exceptionKind === ActionExceptionKind.Known) {
      log.info(...logArguments);
    } else {
      log.error(...logArguments);
    }
  }

  public toReadableString(): string {
    const mainDetail = `ActionException: ${this.uuid}\n${super.toReadableString()}`;
    if (this.exception instanceof Error) {
      return `${mainDetail}\nfrom error: ${this.exception.name}: ${this.exception.message}\n${this.exception.stack}`;
    }
    // @typescript-eslint/restrict-template-expressions
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `${mainDetail}\nfrom unknown: ${this.exception}`;
  }
}
