// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { MessageContent } from "../MatrixTypes/RoomMessage";
import { Result } from "@gnuxie/typescript-result";

export interface RoomMessageSender {
  sendMessage<TContent extends MessageContent>(
    roomID: StringRoomID,
    content: TContent
  ): Promise<Result<StringEventID>>;
}
