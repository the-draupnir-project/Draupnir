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

import { Protection } from "./Protection";
import { Mjolnir } from "../Mjolnir";
import { LogLevel, UserID } from "matrix-bot-sdk";
import { Permalinks } from "../commands/interface-manager/Permalinks";

export class MessageIsMedia extends Protection {

    settings = {};

    constructor() {
        super();
    }

    public get name(): string {
        return 'MessageIsMediaProtection';
    }
    public get description(): string {
        return "If a user posts an image or video, that message will be redacted. No bans are issued.";
    }

    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {
        if (event['type'] === 'm.room.message') {
            const content = event['content'] || {};
            const msgtype = content['msgtype'] || 'm.text';
            const formattedBody = content['formatted_body'] || '';
            const isMedia = msgtype === 'm.image' || msgtype === 'm.video' || formattedBody.toLowerCase().includes('<img');
            if (isMedia) {
                await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, "MessageIsMedia", `Redacting event from ${event['sender']} for posting an image/video. ${Permalinks.forEvent(roomId, event['event_id'], [new UserID(await mjolnir.client.getUserId()).domain])}`);
                // Redact the event
                if (!mjolnir.config.noop) {
                    await mjolnir.client.redactEvent(roomId, event['event_id'], "Images/videos are not permitted here");
                } else {
                    await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, "MessageIsMedia", `Tried to redact ${event['event_id']} in ${roomId} but Mjolnir is running in no-op mode`, roomId);
                }
            }
        }
    }
}
