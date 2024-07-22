/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2021 The Matrix.org Foundation C.I.C.

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

import { LogLevel} from "matrix-bot-sdk";
import { AbstractProtection, ActionResult, CapabilitySet, EventConsequences, MatrixRoomID, Ok, Permalinks, ProtectedRoomsSet, Protection, ProtectionDescription, RoomEvent, RoomMessage, Value, describeProtection, serverName } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";

type MessageIsVoiceCapabilities = {
    eventConsequences: EventConsequences;
};

type MessageIsVoiceSettings = Record<never, never>;

type MessageIsVoiceDescription = ProtectionDescription<Draupnir, MessageIsVoiceSettings, MessageIsVoiceCapabilities>;

describeProtection<MessageIsVoiceCapabilities, Draupnir, MessageIsVoiceSettings>({
    name: 'MessageIsVoiceProtection',
    description: 'If a user posts a voice message, that message will be redacted',
    capabilityInterfaces: {
        eventConsequences: 'EventConsequences',
    },
    defaultCapabilities: {
        eventConsequences: 'StandardEventConsequences'
    },
    factory: function(description, protectedRoomsSet, draupnir, capabilities, _settings) {
        return Ok(
            new MessageIsVoiceProtection(
                description,
                capabilities,
                protectedRoomsSet,
                draupnir
            )
        );
    }
})

export class MessageIsVoiceProtection extends AbstractProtection<MessageIsVoiceDescription> implements Protection<MessageIsVoiceDescription> {
    private readonly eventConsequences: EventConsequences;
    constructor(
        description: MessageIsVoiceDescription,
        capabilities: CapabilitySet,
        protectedRoomsSet: ProtectedRoomsSet,
        private readonly draupnir: Draupnir,
    ) {
        super(
            description,
            capabilities,
            protectedRoomsSet,
            {}
        );
    }

    public async handleTimelineEvent(room: MatrixRoomID, event: RoomEvent): Promise<ActionResult<void>> {
        const roomID = room.toRoomIDOrAlias();
        if (Value.Check(RoomMessage, event)) {
            if (!('msgtype' in event.content) || event.content.msgtype !== 'm.audio') {
                return Ok(undefined);
            }
            await this.draupnir.managementRoomOutput.logMessage(LogLevel.INFO, "MessageIsVoice", `Redacting event from ${event['sender']} for posting a voice message. ${Permalinks.forEvent(roomID, event['event_id'], [serverName(this.draupnir.clientUserID)])}`);
            // Redact the event
            if (!this.draupnir.config.noop) {
                return await this.eventConsequences.consequenceForEvent(roomID, event['event_id'], "Voice messages are not permitted here");
            } else {
                await this.draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "MessageIsVoice", `Tried to redact ${event['event_id']} in ${roomID} but Mjolnir is running in no-op mode`, roomID);
                return Ok(undefined);
            }
        }
        return Ok(undefined);
    }
}
