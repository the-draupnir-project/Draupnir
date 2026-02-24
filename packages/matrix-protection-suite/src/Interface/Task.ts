// Copyright (C) 2023, 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ResultError } from "@gnuxie/typescript-result";
import { Logger } from "../Logging/Logger";
import { ActionError } from "./Action";
import { ActionException, ActionExceptionKind } from "./ActionException";

const log = new Logger("Task");

// FIXME: Maybe we could get the logger here too?
type TaskErrorOptions = { description?: string; log?: Logger } | undefined;

/**
 * An error reporter should destructure `ActionException`s to get all of the
 * context and the referenced uuid.
 */
export type TaskErrorReporter = (
  error: ActionError,
  options: TaskErrorOptions
) => void;

let globalTaskReporter: TaskErrorReporter = function (error, options) {
  const message = options?.description
    ? `Task Failed (${options.description}):`
    : `Task Failed:`;
  (options?.log ?? log).error(message, error.toReadableString());
};

/**
 * Allows the reporter for all failed tasks to be set.
 * @param reporter A function that implements `TaskErrorReporter`.
 * @see {@link TaskErrorReporter}.
 */
export function setGlobalTaskReporter(reporter: TaskErrorReporter): void {
  globalTaskReporter = reporter;
}

/**
 * Sometimes an `Action` takes place in the background usually a result of an
 * event listener. This means that any errors that are experienced will not
 * have a direct way to reach the user of the application.
 *
 * Up until now, the doctrine for this situation has been to simply log
 * at the error level and move on. However, as a background task failing
 * silently is distinct from simply reporting an error to the error level,
 * we believe that the ability for a consumer of the library to configure
 * what happens to these errors is important.
 */
export async function Task(
  task: Promise<unknown>,
  options?: TaskErrorOptions
): Promise<void> {
  try {
    const result = await task;
    if (
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      result.error instanceof ResultError
    ) {
      globalTaskReporter(result.error, options);
      return;
    }
    return;
  } catch (exception) {
    const actionException = new ActionException(
      ActionExceptionKind.Unknown,
      exception,
      "A Task failed with an unknown exception"
    );
    globalTaskReporter(actionException, options);
  }
}
