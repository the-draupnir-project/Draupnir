// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { ConfigRecoverableError } from "matrix-protection-suite";
import { SafeModeCause, SafeModeReason } from "./SafeModeCause";
import { MatrixReactionHandler } from "@the-draupnir-project/mps-interface-adaptor";

export function renderRecoveryOptions(cause: SafeModeCause): DocumentNode {
  const recoveryOptions =
    cause.reason === SafeModeReason.ByRequest
      ? []
      : cause.error instanceof ConfigRecoverableError
        ? cause.error.recoveryOptions
        : [];
  if (recoveryOptions.length === 0) {
    return (
      <fragment>
        No recovery options are available for this failure mode.
      </fragment>
    );
  }
  return (
    <fragment>
      <p>
        Recovery options are available for this failure mode:
        <ol>
          {recoveryOptions.map((option) => (
            <li>{option.description}</li>
          ))}
        </ol>
      </p>
      <hr />
      <p>
        To use a <b>recovery option</b>, click on one of the reactions (
        {recoveryOptions
          .map((_, index) => MatrixReactionHandler.numberToEmoji(index + 1))
          .join(", ")}
        ), or use the recover command: <code>!draupnir recover 1</code>.
      </p>
    </fragment>
  );
}
