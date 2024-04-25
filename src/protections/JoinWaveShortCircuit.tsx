/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2022 The Matrix.org Foundation C.I.C.

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

import { AbstractProtection, ActionResult, CapabilitySet, Logger, MembershipChange, MembershipChangeType, Ok, ProtectedRoomsSet, ProtectionDescription, RoomMembershipRevision, SafeIntegerProtectionSetting, StandardProtectionSettings, StringRoomID, describeProtection, isError } from "matrix-protection-suite";
import {LogLevel} from "matrix-bot-sdk";
import { Draupnir } from "../Draupnir";
import { DraupnirProtection } from "./Protection";

const log = new Logger('JoinWaveShortCircuitProtection');

const DEFAULT_MAX_PER_TIMESCALE = 50;
const DEFAULT_TIMESCALE_MINUTES = 60;
const ONE_MINUTE = 60_000; // 1min in ms

type JoinWaveShortCircuitProtectionSettings = {
    maxPer: number,
    timescaleMinutes: number,
}

// TODO: Add join rule capability.
type JoinWaveShortCircuitProtectionCapabilities = {}

type JoinWaveShortCircuitProtectionDescription = ProtectionDescription<Draupnir, JoinWaveShortCircuitProtectionSettings, JoinWaveShortCircuitProtectionCapabilities>;

describeProtection<JoinWaveShortCircuitProtectionCapabilities, Draupnir, JoinWaveShortCircuitProtectionSettings>({
    name: 'JoinWaveShortCircuitProtection',
    description: "If X amount of users join in Y time, set the room to invite-only.",
    capabilityInterfaces: {},
    defaultCapabilities: {},
    factory: function(description, protectedRoomsSet, draupnir, capabilities, settings) {
        const parsedSettings = description.protectionSettings.parseSettings(settings);
        if (isError(parsedSettings)) {
            return parsedSettings
        }
        return Ok(
            new JoinWaveShortCircuitProtection(
                description,
                capabilities,
                protectedRoomsSet,
                draupnir,
                parsedSettings.ok
            )
        )
    },
    protectionSettings: new StandardProtectionSettings({
        maxPer: new SafeIntegerProtectionSetting(
            'maxPer'
        ),
        timescaleMinutes: new SafeIntegerProtectionSetting(
            'timescaleMinutes'
        )
    },
    {
        maxPer: DEFAULT_MAX_PER_TIMESCALE,
        timescaleMinutes: DEFAULT_TIMESCALE_MINUTES,
    })
})

export class JoinWaveShortCircuitProtection extends AbstractProtection<JoinWaveShortCircuitProtectionDescription> implements DraupnirProtection<JoinWaveShortCircuitProtectionDescription> {
    private joinBuckets: {
        [roomID: StringRoomID]: {
            lastBucketStart: Date,
            numberOfJoins: number,
        }
    } = {};

    constructor(
        description: JoinWaveShortCircuitProtectionDescription,
        capabilities: CapabilitySet,
        protectedRoomsSet: ProtectedRoomsSet,
        private readonly draupnir: Draupnir,
        public readonly settings: JoinWaveShortCircuitProtectionSettings
    ) {
        super(
            description,
            capabilities,
            protectedRoomsSet,
            {
                requiredStatePermissions: ["m.room.join_rules"]
            }
        );
    }
    public async handleMembershipChange(revision: RoomMembershipRevision, changes: MembershipChange[]): Promise<ActionResult<void>> {
        const roomID = revision.room.toRoomIDOrAlias();
        for (const change of changes) {
            await this.handleMembership(roomID, change).catch(e => log.error(`Unexpected error handling memebership change`, e));
        }
        return Ok(undefined);
    }

    public async handleMembership(roomID: StringRoomID, change: MembershipChange): Promise<void> {
        if (change.membershipChangeType !== MembershipChangeType.Joined) {
            return;
        }

        // If either the roomId bucket didn't exist, or the bucket has expired, create a new one
        if (!this.joinBuckets[roomID] || this.hasExpired(this.joinBuckets[roomID].lastBucketStart)) {
            this.joinBuckets[roomID] = {
                lastBucketStart: new Date(),
                numberOfJoins: 0
            }
        }

        if (++this.joinBuckets[roomID].numberOfJoins >= this.settings.maxPer) {
            await this.draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "JoinWaveShortCircuit", `Setting ${roomID} to invite-only as more than ${this.settings.maxPer} users have joined over the last ${this.settings.timescaleMinutes} minutes (since ${this.joinBuckets[roomID].lastBucketStart})`, roomID);

            if (!this.draupnir.config.noop) {
                await this.draupnir.client.sendStateEvent(roomID, "m.room.join_rules", "", {"join_rule": "invite"})
            } else {
                await this.draupnir.managementRoomOutput.logMessage(LogLevel.WARN, "JoinWaveShortCircuit", `Tried to set ${roomID} to invite-only, but Mjolnir is running in no-op mode`, roomID);
            }
        }
    }

    private hasExpired(at: Date): boolean {
        return ((new Date()).getTime() - at.getTime()) > this.timescaleMilliseconds()
    }

    private timescaleMilliseconds(): number {
        return (this.settings.timescaleMinutes * ONE_MINUTE)
    }

    /**
     * Yeah i know this is evil but
     * We need to figure this out once we allow protections to have their own
     * command tables somehow.
     * which will probably entail doing the symbol case hacks from Utena for camel case etc.
    public async status(keywords, subcommands): Promise<DocumentNode> {
        const withExpired = subcommand.includes("withExpired");
        const withStart = subcommand.includes("withStart");

        let html = `<b>Short Circuit join buckets (max ${this.settings.maxPer.value} per ${this.settings.timescaleMinutes.value} minutes}):</b><br/><ul>`;
        let text = `Short Circuit join buckets (max ${this.settings.maxPer.value} per ${this.settings.timescaleMinutes.value} minutes):\n`;

        for (const roomId of Object.keys(this.joinBuckets)) {
            const bucket = this.joinBuckets[roomId];
            const isExpired = this.hasExpired(bucket.lastBucketStart);

            if (isExpired && !withExpired) {
                continue;
            }

            const startText = withStart ? ` (since ${bucket.lastBucketStart})` : "";
            const expiredText = isExpired ? ` (bucket expired since ${new Date(bucket.lastBucketStart.getTime() + this.timescaleMilliseconds())})` : "";

            html += `<li><a href="https://matrix.to/#/${roomId}">${roomId}</a>: ${bucket.numberOfJoins} joins${startText}${expiredText}.</li>`;
            text += `* ${roomId}: ${bucket.numberOfJoins} joins${startText}${expiredText}.\n`;
        }

        html += "</ul>";

        return {
            html,
            text,
        }
    }
    */
}
