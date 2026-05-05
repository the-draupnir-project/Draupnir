// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";

export interface RoomReactionSender {
  sendReaction(
    roomID: StringRoomID,
    eventID: StringEventID,
    key: string
  ): Promise<Result<StringEventID>>;
}
