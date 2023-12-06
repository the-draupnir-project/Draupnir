/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.

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

import { LogLevel } from "matrix-bot-sdk";
import { AbstractProtection, ActionResult, ConsequenceProvider, MatrixRoomID, Ok, Permalinks, ProtectedRoomsSet, Protection, ProtectionDescription, RoomEvent, RoomMessage, Value, describeProtection, serverName } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";

type MessageIsMediaProtectionSettings = {};

describeProtection<Draupnir, MessageIsMediaProtectionSettings>({
    name: 'MessageIsMediaProtection',
    description: "If a user posts an image or video, that message will be redacted. No bans are issued.",
    factory: function(description, consequenceProvider, protectedRoomsSet, draupnir, _settings) {
        return Ok(
            new MessageIsMediaProtection(
                description,
                consequenceProvider,
                protectedRoomsSet,
                draupnir
            )
        )
    }
})

export class MessageIsMediaProtection extends AbstractProtection implements Protection {
    constructor(
        description: ProtectionDescription<Draupnir, MessageIsMediaProtectionSettings>,
        consequenceProvider: ConsequenceProvider,
        protectedRoomsSet: ProtectedRoomsSet,
        private readonly draupnir: Draupnir
    ) {
        super(
            description,
            consequenceProvider,
            protectedRoomsSet,
            [],
            []
        );
    }

    public async handleTimelineEvent(room: MatrixRoomID, event: RoomEvent): Promise<ActionResult<void>> {
        if (Value.Check(RoomMessage, event)) {
            const msgtype = event.content?.['msgtype'] || 'm.text';
            const formattedBody = event.content !== undefined && 'formatted_body' in event.content ? event.content?.['formatted_body'] || '' : '';
            const isMedia = msgtype === 'm.image' || msgtype === 'm.video' || formattedBody.toLowerCase().includes('<img');
            if (isMedia) {
                const roomID = room.toRoomIDOrAlias();
                await this.draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "MessageIsMedia", `Redacting event from ${event['sender']} for posting an image/video. ${Permalinks.forEvent(roomID, event['event_id'], [serverName(this.draupnir.clientUserID)])}`);
                // Redact the event
                if (this.draupnir.config.noop) {
                    await this.draupnir.client.redactEvent(roomID, event['event_id'], "Images/videos are not permitted here");
                } else {
                    await this.draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "MessageIsMedia", `Tried to redact ${event['event_id']} in ${roomID} but Mjolnir is running in no-op mode`, roomID);
                }
            }
        }
        return Ok(undefined);
    }
}
