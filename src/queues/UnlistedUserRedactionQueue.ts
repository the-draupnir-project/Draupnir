/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */
import { LogLevel, LogService } from "matrix-bot-sdk";
import { Permalinks, RoomEvent, StringRoomID, StringUserID } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";

/**
 * A queue of users who have been flagged for redaction typically by the flooding or image protection.
 * Specifically any new events sent by a queued user will be redacted.
 * This does not handle previously sent events, for that see the `EventRedactionQueue`.
 * These users are not listed as banned in any watch list and so may continue
 * to view a room until a moderator can investigate.
 */
export class UnlistedUserRedactionQueue {
    private usersToRedact = new Set<StringUserID>();

    constructor() {
    }

    public addUser(userID: StringUserID) {
        this.usersToRedact.add(userID);
    }

    public removeUser(userID: StringUserID) {
        this.usersToRedact.delete(userID);
    }

    public isUserQueued(userID: StringUserID): boolean {
        return this.usersToRedact.has(userID);
    }

    public async handleEvent(roomID: StringRoomID, event: RoomEvent, draupnir: Draupnir) {
        if (this.isUserQueued(event['sender'])) {
            const permalink = Permalinks.forEvent(roomID, event['event_id']);
            try {
                LogService.info("AutomaticRedactionQueue", `Redacting event because the user is listed as bad: ${permalink}`)
                if (!draupnir.config.noop) {
                    await draupnir.client.redactEvent(roomID, event['event_id']);
                } else {
                    await draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "AutomaticRedactionQueue", `Tried to redact ${permalink} but Mjolnir is running in no-op mode`);
                }
            } catch (e) {
                draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "AutomaticRedactionQueue", `Unable to redact message: ${permalink}`);
                LogService.warn("AutomaticRedactionQueue", e);
            }
        }
    }
}
