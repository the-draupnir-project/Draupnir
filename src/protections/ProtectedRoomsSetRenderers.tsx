// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionError,
  ProtectionDescription,
  StringRoomID,
} from "matrix-protection-suite";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { renderMatrixAndSend } from "../commands/interface-manager/DeadDocumentMatrix";
import { DeadDocumentJSX } from "../commands/interface-manager/JSXFactory";

export async function renderProtectionFailedToStart(
  client: MatrixSendClient,
  managementRoomID: StringRoomID,
  error: ActionError,
  protectionName: string,
  _protectionDescription?: ProtectionDescription
): Promise<void> {
  await renderMatrixAndSend(
    <root>
      <span>
        A protection {protectionName} failed to start for the following reason:
      </span>
      <span>{error.message}</span>
    </root>,
    managementRoomID,
    undefined,
    client
  );
}
