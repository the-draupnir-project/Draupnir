// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import { DeadDocumentJSX, DocumentNode } from "../DeadDocument";

export function renderConfirmationPrompt(
  result: Result<unknown>
): Result<DocumentNode | undefined> {
  if (isError(result)) {
    return Ok(undefined);
  }
  return Ok(
    <root>
      <h4>This command requires confirmation</h4>
      <p>
        Please consider the consequences of this command, do you wish to
        proceed?
      </p>
    </root>
  );
}
