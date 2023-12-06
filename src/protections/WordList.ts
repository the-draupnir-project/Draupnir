/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2020 Emi Tatsuo Simpson et al.

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

import { AbstractProtection, ActionResult, ConsequenceProvider, Logger, MatrixRoomID, MembershipChange, MembershipChangeType, Ok, ProtectedRoomsSet, Protection, ProtectionDescription, RoomEvent, RoomMembershipRevision, RoomMessage, StringRoomID, StringUserID, Value, describeProtection } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";

const log = new Logger('WordList');

describeProtection<Draupnir>({
    name: 'WordListProteciton',
    description: "If a user posts a monitored word a set amount of time after joining, they\
    will be banned from that room.  This will not publish the ban to a ban list.",
    factory: function(description, consequenceProvider, protectedRoomsSet, draupnir, _settings) {
        return Ok(
            new WordListProtection(
                description,
                consequenceProvider,
                protectedRoomsSet,
                draupnir
            )
        );
    }
});

export class WordListProtection extends AbstractProtection implements Protection {
    private justJoined: { [roomID: StringRoomID]: { [username: StringUserID]: Date} } = {};
    private badWords?: RegExp;

    constructor(
        description: ProtectionDescription<Draupnir>,
        consequenceProvider: ConsequenceProvider,
        protectedRoomsSet: ProtectedRoomsSet,
        private readonly draupnir: Draupnir,
    ) {
        super(
            description,
            consequenceProvider,
            protectedRoomsSet,
            [],
            []
        );
    }
    public async handleMembershipChange(revision: RoomMembershipRevision, changes: MembershipChange[]): Promise<ActionResult<void>> {
        const roomID = revision.room.toRoomIDOrAlias();
        const minsBeforeTrusting = this.draupnir.config.protections.wordlist.minutesBeforeTrusting;
        if (minsBeforeTrusting > 0) {
            for (const change of changes) {
                if (!this.justJoined[roomID]) this.justJoined[roomID] = {};

                // When a new member logs in, store the time they joined.  This will be useful
                // when we need to check if a message was sent within 20 minutes of joining
                if (change.membershipChangeType === MembershipChangeType.Joined) {
                    const now = new Date();
                    this.justJoined[roomID][change.userID] = now;
                    log.debug(`${change.userID} joined ${roomID} at ${now.toDateString()}`);
                } else if (change.membershipChangeType === MembershipChangeType.Left || change.membershipChangeType === MembershipChangeType.Banned || change.membershipChangeType === MembershipChangeType.Kicked) {
                    delete this.justJoined[roomID][change.userID]
                }
            }
        }
        return Ok(undefined);
    }

    public async handleTimelineEvent(room: MatrixRoomID, event: RoomEvent): Promise<ActionResult<void>> {
        const minsBeforeTrusting = this.draupnir.config.protections.wordlist.minutesBeforeTrusting;
        if (Value.Check(RoomMessage, event)) {
            const message = (event.content !== undefined && 'formatted_body' in event.content && event.content?.['formatted_body']) || event.content?.['body'];
            if (!message === undefined) {
                return Ok(undefined);
            }
            const roomID = room.toRoomIDOrAlias();

            // Check conditions first
            if (minsBeforeTrusting > 0) {
                const joinTime = this.justJoined[roomID][event['sender']]
                if (joinTime) { // Disregard if the user isn't recently joined

                    // Check if they did join recently, was it within the timeframe
                    const now = new Date();
                    if (now.valueOf() - joinTime.valueOf() > minsBeforeTrusting * 60 * 1000) {
                        delete this.justJoined[roomID][event['sender']] // Remove the user
                        log.info(`${event['sender']} is no longer considered suspect`);
                        return Ok(undefined);
                    }

                } else {
                    // The user isn't in the recently joined users list, no need to keep
                    // looking
                    return Ok(undefined);
                }
            }
            if (!this.badWords) {
                // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
                const escapeRegExp = (string: string) => {
                    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                };

                // Create a mega-regex from all the tiny words.
                const words = this.draupnir.config.protections.wordlist.words.filter(word => word.length !== 0).map(escapeRegExp);
                this.badWords = new RegExp(words.join("|"), "i");
            }

            const match = this.badWords!.exec(message ?? '');
            if (match) {
                const reason = `bad word: ${match[0]}`;
                await this.consequenceProvider.consequenceForUserInRoom(this.description, roomID, event.sender, reason);
                await this.consequenceProvider.consequenceForEvent(this.description, roomID, event.event_id, reason);
            }
        }
        return Ok(undefined);
    }
}
