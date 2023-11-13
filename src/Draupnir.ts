/**
 * Copyright (C) 2022-2023 Gnuxie <Gnuxie@protonmail.com>
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

import { Logger, Ok, ProtectedRoomsSet, StringRoomID, Task, TextMessageContent, Value } from "matrix-protection-suite";
import { UnlistedUserRedactionQueue } from "./queues/UnlistedUserRedactionQueue";
import { findCommandTable } from "./commands/interface-manager/InterfaceCommand";
import { WebAPIs } from "./webapis/WebAPIs";
import { ThrottlingQueue } from "./queues/ThrottlingQueue";
import ManagementRoomOutput from "./ManagementRoomOutput";
import { ReportPoller } from "./report/ReportPoller";
import { ProtectionManager } from "./protections/ProtectionManager";
import { ReportManager } from "./report/ReportManager";
import { MatrixReactionHandler } from "./commands/interface-manager/MatrixReactionHandler";
import { MatrixSendClient, SafeMatrixEmitter } from "matrix-protection-suite-for-matrix-bot-sdk";
import { IConfig } from "./config";
import { COMMAND_PREFIX, extractCommandFromMessageBody, handleCommand } from "./commands/CommandHandler";

const log = new Logger('Draupnir');

export class Draupnir {
    private displayName: string;
    private localpart: string;
    /**
     * This is for users who are not listed on a watchlist,
     * but have been flagged by the automatic spam detection as suispicous
     */
    private unlistedUserRedactionQueue = new UnlistedUserRedactionQueue();

    private webapis: WebAPIs;
    private readonly commandTable = findCommandTable("mjolnir");
    public taskQueue: ThrottlingQueue;
    /**
     * Reporting back to the management room.
     */
    public readonly managementRoomOutput: ManagementRoomOutput;
    /*
     * Config-enabled polling of reports in Synapse, so Mjolnir can react to reports
     */
    private reportPoller?: ReportPoller;
    /**
     * Store the protections being used by Mjolnir.
     */
    public readonly legacyProtectionManager: ProtectionManager;
    /**
     * Handle user reports from the homeserver.
     */
    public readonly reportManager: ReportManager;

    public readonly reactionHandler: MatrixReactionHandler;
    private constructor(
        public readonly client: MatrixSendClient,
        private readonly clientUserId: string,
        public readonly matrixEmitter: SafeMatrixEmitter,
        public readonly managementRoomId: string,
        public readonly config: IConfig,
        public readonly protectedRoomsSet: ProtectedRoomsSet
    ) {
        this.reactionHandler = new MatrixReactionHandler(this.managementRoomId, client, clientUserId);
        this.setupMatrixEmitterListeners();
    }

    private handleEvent(roomID: StringRoomID, event: RoomEvent): void {

        // Check for updated ban lists before checking protected rooms - the ban lists might be protected
        // themselves.
        const policyList = this.policyListManager.lists.find(list => list.roomId === roomId);
        if (policyList !== undefined) {
            if (ALL_BAN_LIST_RULE_TYPES.includes(event['type']) || event['type'] === 'm.room.redaction') {
                policyList.updateForEvent(event.event_id)
            }
        }

        if (event.sender !== this.clientUserId) {
            this.protectedRoomsTracker.handleEvent(roomId, event);
        }
    }

    private setupMatrixEmitterListeners(): void {
        this.matrixEmitter.on("room.message", (roomID, event) => {
            if (roomID !== this.managementRoomId) {
                return;
            }
            if (Value.Check(TextMessageContent, event.content)) {
                if (event.content.body === "** Unable to decrypt: The sender's device has not sent us the keys for this message. **") {
                    log.info(`Unable to decrypt an event ${event.event_id} from ${event.sender} in the management room ${this.managementRoomId}.`);
                    Task(this.client.unstableApis.addReactionToEvent(roomID, event.event_id, '⚠').then(_ => Ok(undefined)));
                    Task(this.client.unstableApis.addReactionToEvent(roomID, event.event_id, 'UISI').then(_ => Ok(undefined)));
                    Task(this.client.unstableApis.addReactionToEvent(roomID, event.event_id, '🚨').then(_ => Ok(undefined)));
                    return;
                }
                const commandBeingRun = extractCommandFromMessageBody(
                    event.content.body,
                    {
                        prefix: COMMAND_PREFIX,
                        localpart: this.localpart,
                        displayName: this.displayName,
                        userId: this.clientUserId,
                        additionalPrefixes: this.config.commands.additionalPrefixes,
                        allowNoPrefix: this.config.commands.allowNoPrefix,
                    }
                );
                if (commandBeingRun === undefined) {
                    return;
                }
                log.info(`Command being run by ${event.sender}: ${commandBeingRun}`);
                Task(this.client.sendReadReceipt(roomID, event.event_id).then((_) => Ok(undefined)))
                Task(handleCommand(roomID, event, commandBeingRun, this, this.commandTable).then((_) => Ok(undefined)));
            }
        });
    }
}
