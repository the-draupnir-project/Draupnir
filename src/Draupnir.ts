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

import { DefaultEventDecoder, Logger, MatrixRoomID, Ok, ProtectedRoomsSet, RoomEvent, StringRoomID, StringUserID, Task, TextMessageContent, Value, isError, serverName, userLocalpart } from "matrix-protection-suite";
import { UnlistedUserRedactionQueue } from "./queues/UnlistedUserRedactionQueue";
import { findCommandTable } from "./commands/interface-manager/InterfaceCommand";
import { ThrottlingQueue } from "./queues/ThrottlingQueue";
import ManagementRoomOutput from "./ManagementRoomOutput";
import { ReportPoller } from "./report/ReportPoller";
import { ReportManager } from "./report/ReportManager";
import { MatrixReactionHandler } from "./commands/interface-manager/MatrixReactionHandler";
import { DefaultStateTrackingMeta, ManagerManager, ManagerManagerForMatrixEmitter, MatrixSendClient, SafeMatrixEmitter } from "matrix-protection-suite-for-matrix-bot-sdk";
import { IConfig } from "./config";
import { COMMAND_PREFIX, extractCommandFromMessageBody, handleCommand } from "./commands/CommandHandler";
import { makeProtectedRoomsSet } from "./DraupnirBotMode";
import { makeStandardConsequenceProvider, renderProtectionFailedToStart } from "./StandardConsequenceProvider";

const log = new Logger('Draupnir');

// webAPIS should not be included on the Draupnir class.
// That should be managed elsewhere.
// It's not actually relevant to the Draupnir instance and it only was connected
// to Mjolnir because it needs to be started after Mjolnir started and not before.
// And giving it to the class was a dumb easy way of doing that.

export class Draupnir {
    private readonly displayName: string;
    /**
     * This is for users who are not listed on a watchlist,
     * but have been flagged by the automatic spam detection as suispicous
     */
    public unlistedUserRedactionQueue = new UnlistedUserRedactionQueue();

    private readonly commandTable = findCommandTable("mjolnir");
    public taskQueue: ThrottlingQueue;
    /**
     * Reporting back to the management room.
     */
    public readonly managementRoomOutput: ManagementRoomOutput;
    public readonly managementRoomID: StringRoomID;
    /*
     * Config-enabled polling of reports in Synapse, so Mjolnir can react to reports
     */
    private reportPoller?: ReportPoller;
    /**
     * Handle user reports from the homeserver.
     * FIXME: ReportManager should be a protection.
     */
    public readonly reportManager: ReportManager;

    public readonly reactionHandler: MatrixReactionHandler;
    private constructor(
        public readonly client: MatrixSendClient,
        public readonly clientUserID: StringUserID,
        public readonly matrixEmitter: SafeMatrixEmitter,
        public readonly managementRoom: MatrixRoomID,
        public readonly config: IConfig,
        public readonly protectedRoomsSet: ProtectedRoomsSet,
        public readonly managerManager: ManagerManager
    ) {
        this.managementRoomID = this.managementRoom.toRoomIDOrAlias();
        this.reactionHandler = new MatrixReactionHandler(this.managementRoom.toRoomIDOrAlias(), client, clientUserID);
        this.setupMatrixEmitterListeners();
        this.reportManager = new ReportManager(this);
        if (config.pollReports) {
            this.reportPoller = new ReportPoller(this, this.reportManager);
        }
    }

    public static async makeDraupnirBot(
        client: MatrixSendClient,
        matrixEmitter: SafeMatrixEmitter,
        clientUserID: StringUserID,
        managementRoom: MatrixRoomID,
        config: IConfig
    ): Promise<Draupnir> {
        const managerManager = new ManagerManagerForMatrixEmitter(
            matrixEmitter,
            DefaultStateTrackingMeta,
            DefaultEventDecoder,
            client
        );
        const protectedRoomsSet = await makeProtectedRoomsSet(
            managementRoom,
            managerManager,
            client,
            clientUserID
        )
        const draupnir = new Draupnir(
            client,
            clientUserID,
            matrixEmitter,
            managementRoom,
            config,
            protectedRoomsSet,
            managerManager
        );
        const loadResult = await protectedRoomsSet.protections.loadProtections(
            makeStandardConsequenceProvider(client, draupnir.managementRoomID),
            protectedRoomsSet,
            draupnir,
            (error, description) => renderProtectionFailedToStart(
                client, managementRoom.toRoomIDOrAlias(), error, description
            )
        );
        if (isError(loadResult)) {
            throw loadResult.error;
        }
        return draupnir;
    }

    private handleEvent(roomID: StringRoomID, event: RoomEvent): void {
        this.protectedRoomsSet.handleTimelineEvent(roomID, event);
    }

    private setupMatrixEmitterListeners(): void {
        this.matrixEmitter.on("room.message", (roomID, event) => {
            if (roomID !== this.managementRoom.toRoomIDOrAlias()) {
                return;
            }
            if (Value.Check(TextMessageContent, event.content)) {
                if (event.content.body === "** Unable to decrypt: The sender's device has not sent us the keys for this message. **") {
                    log.info(`Unable to decrypt an event ${event.event_id} from ${event.sender} in the management room ${this.managementRoom}.`);
                    Task(this.client.unstableApis.addReactionToEvent(roomID, event.event_id, '⚠').then(_ => Ok(undefined)));
                    Task(this.client.unstableApis.addReactionToEvent(roomID, event.event_id, 'UISI').then(_ => Ok(undefined)));
                    Task(this.client.unstableApis.addReactionToEvent(roomID, event.event_id, '🚨').then(_ => Ok(undefined)));
                    return;
                }
                const commandBeingRun = extractCommandFromMessageBody(
                    event.content.body,
                    {
                        prefix: COMMAND_PREFIX,
                        localpart: userLocalpart(this.clientUserID),
                        displayName: this.displayName,
                        userId: this.clientUserID,
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

    public async start(): Promise<void> {
        if (this.reportPoller) {
            const reportPollSetting = await ReportPoller.getReportPollSetting(
                this.client,
                this.managementRoomOutput
            );
            this.reportPoller.start(reportPollSetting);
        }
    }

    public createRoomReference(roomID: StringRoomID): MatrixRoomID {
        return new MatrixRoomID(
            roomID,
            [serverName(this.clientUserID)]
        );
    }
}
