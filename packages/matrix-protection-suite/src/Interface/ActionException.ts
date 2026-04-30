// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

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

function describeThrowable(throwable: unknown): string {
  if (typeof throwable === "string") {
    return throwable;
  }
  if (
    typeof throwable === "number" ||
    typeof throwable === "boolean" ||
    typeof throwable === "bigint" ||
    typeof throwable === "symbol" ||
    throwable === null ||
    throwable === undefined
  ) {
    return String(throwable);
  }
  if (Array.isArray(throwable)) {
    return `array(length=${throwable.length})`;
  }
  if (typeof throwable === "object") {
    const keys = Object.keys(throwable);
    return keys.length === 0
      ? "object with no enumerable keys"
      : `object with keys: ${keys.join(",")}`;
  }
  return typeof throwable;
}

export function assertThrowableIsError(throwable: unknown): Error {
  if (throwable instanceof Error) {
    return throwable;
  }
  throw new TypeError(
    `Expected a thrown Error instance but received ${describeThrowable(throwable)}`
  );
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
    public readonly exception: Error,
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
    options: { exception: Error; exceptionKind: ActionExceptionKind }
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
    return `${mainDetail}\nfrom error: ${this.exception.name}: ${this.exception.message}\n${this.exception.stack}`;
  }
}
