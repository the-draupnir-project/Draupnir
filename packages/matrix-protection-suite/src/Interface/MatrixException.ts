// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ActionError, ActionResult, ResultError } from "./Action";
import { ActionException, ActionExceptionKind } from "./ActionException";

export class MatrixException extends ActionException implements ActionError {
  public constructor(
    exception: unknown,
    public readonly matrixErrorCode: string,
    public readonly matrixErrorMessage: string,
    message: string = matrixErrorMessage,
    kind: ActionExceptionKind = ActionExceptionKind.Unknown
  ) {
    super(kind, exception, message);
  }

  /**
   * Result wrapper, @see ActionError.
   * Named because of https://github.com/microsoft/TypeScript/issues/4628.
   */
  public static R(options: {
    exception: Error;
    exceptionKind?: ActionExceptionKind;
    matrixErrorCode: string;
    matrixErrorMessage: string;
    /** Message will usually include context from the http client such as the endpoint used. */
    message: string;
  }): ActionResult<never, MatrixException> {
    return ResultError(
      new MatrixException(
        options.exceptionKind,
        options.matrixErrorCode,
        options.matrixErrorMessage,
        options.message,
        options.exceptionKind
      )
    );
  }
}
