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
  RoomMessageSender,
  Task,
} from "matrix-protection-suite";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { sendMatrixEventsFromDeadDocument } from "@the-draupnir-project/mps-interface-adaptor";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";

// The callback that this is required for in MPS, is kinda silly and should
// really be `void` and not `Promise<void>`. If it wanted to be `Promise<void>`,
// then it should really be `Promise<Result<void>>`.
export async function renderProtectionFailedToStart(
  roomMessageSender: RoomMessageSender,
  managementRoomID: StringRoomID,
  error: ActionError,
  protectionName: string,
  _protectionDescription?: ProtectionDescription
): Promise<void> {
  void Task(
    sendMatrixEventsFromDeadDocument(
      roomMessageSender,
      managementRoomID,
      <root>
        <span>
          A protection {protectionName} failed to start for the following
          reason:
        </span>
        <span>{error.message}</span>
      </root>,
      {}
    ) as Promise<Result<void>>
  );
}
