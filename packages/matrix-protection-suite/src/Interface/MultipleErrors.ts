// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { ActionError, ActionResult, ResultError } from "./Action";

export class MultipleErrors extends ActionError {
  constructor(
    message: string,
    public readonly errors: ActionError[]
  ) {
    super(message);
  }

  public static Result(
    message: string,
    { errors }: { errors: ActionError[] }
  ): ActionResult<never> {
    return ResultError(new MultipleErrors(message, errors));
  }
}
