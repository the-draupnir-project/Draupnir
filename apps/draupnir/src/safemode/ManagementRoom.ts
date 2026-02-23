// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixInterfaceCommandDispatcher } from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  Logger,
  Ok,
  RoomEvent,
  RoomMessage,
  Task,
  TextMessageContent,
  Value,
} from "matrix-protection-suite";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { MatrixEventContext } from "@the-draupnir-project/mps-interface-adaptor";

const log = new Logger("ManagementRoom");

export function makeCommandDispatcherTimelineListener(
  managementRoom: MatrixRoomID,
  client: MatrixSendClient,
  dispatcher: MatrixInterfaceCommandDispatcher<MatrixEventContext>
): (roomID: StringRoomID, event: RoomEvent) => void {
  const managementRoomID = managementRoom.toRoomIDOrAlias();
  return function (roomID, event): void {
    if (roomID !== managementRoomID) {
      return;
    }
    if (
      Value.Check(RoomMessage, event) &&
      Value.Check(TextMessageContent, event.content)
    ) {
      if (
        event.content.body ===
        "** Unable to decrypt: The sender's device has not sent us the keys for this message. **"
      ) {
        log.info(
          `Unable to decrypt an event ${event.event_id} from ${event.sender} in the management room ${managementRoom.toPermalink()}.`
        );
        void Task(
          client.unstableApis
            .addReactionToEvent(roomID, event.event_id, "⚠")
            .then((_) => Ok(undefined))
        );
        void Task(
          client.unstableApis
            .addReactionToEvent(roomID, event.event_id, "UISI")
            .then((_) => Ok(undefined))
        );
        void Task(
          client.unstableApis
            .addReactionToEvent(roomID, event.event_id, "🚨")
            .then((_) => Ok(undefined))
        );
        return;
      }
      dispatcher.handleCommandMessageEvent(
        {
          event,
          roomID,
        },
        event.content.body
      );
    }
  };
}
