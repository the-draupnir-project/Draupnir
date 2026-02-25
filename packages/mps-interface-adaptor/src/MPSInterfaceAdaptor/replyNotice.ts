// Copyright 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { RoomMessageSender } from "matrix-protection-suite";
import { Result } from "@gnuxie/typescript-result";
import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";

export async function replyNoticeText(
  roomMessageSender: RoomMessageSender,
  roomID: StringRoomID,
  eventID: StringEventID,
  text: string
): Promise<Result<StringEventID>> {
  return await roomMessageSender.sendMessage(roomID, {
    body: text,
    msgtype: "m.notice",
    "m.relates_to": {
      "m.in_reply_to": {
        event_id: eventID,
      },
    },
  });
}
