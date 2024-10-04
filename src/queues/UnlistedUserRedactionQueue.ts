// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>
import { LogLevel, LogService } from "matrix-bot-sdk";
import { RoomEvent } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  StringUserID,
  StringRoomID,
  Permalinks,
} from "@the-draupnir-project/matrix-basic-types";

/**
 * A queue of users who have been flagged for redaction typically by the flooding or image protection.
 * Specifically any new events sent by a queued user will be redacted.
 * This does not handle previously sent events, for that see the `EventRedactionQueue`.
 * These users are not listed as banned in any watch list and so may continue
 * to view a room until a moderator can investigate.
 */
export class UnlistedUserRedactionQueue {
  private usersToRedact = new Set<StringUserID>();

  public addUser(userID: StringUserID) {
    this.usersToRedact.add(userID);
  }

  public removeUser(userID: StringUserID) {
    this.usersToRedact.delete(userID);
  }

  public isUserQueued(userID: StringUserID): boolean {
    return this.usersToRedact.has(userID);
  }

  public async handleEvent(
    roomID: StringRoomID,
    event: RoomEvent,
    draupnir: Draupnir
  ) {
    if (this.isUserQueued(event["sender"])) {
      const permalink = Permalinks.forEvent(roomID, event["event_id"]);
      try {
        LogService.info(
          "AutomaticRedactionQueue",
          `Redacting event because the user is listed as bad: ${permalink}`
        );
        if (!draupnir.config.noop) {
          await draupnir.client.redactEvent(roomID, event["event_id"]);
        } else {
          await draupnir.managementRoomOutput.logMessage(
            LogLevel.WARN,
            "AutomaticRedactionQueue",
            `Tried to redact ${permalink} but Draupnir is running in no-op mode`
          );
        }
      } catch (e) {
        await draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "AutomaticRedactionQueue",
          `Unable to redact message: ${permalink}`
        );
        LogService.warn("AutomaticRedactionQueue", e);
      }
    }
  }
}
