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

import { Client, ClientRooms, EventReport, Logger, MatrixRoomID, MatrixRoomReference, Membership, MembershipEvent, Ok, PolicyRoomManager, ProtectedRoomsSet, RoomEvent, RoomMembershipManager, RoomMessage, RoomStateManager, StringRoomID, StringUserID, Task, TextMessageContent, Value, isError, isStringRoomAlias, isStringRoomID, serverName, userLocalpart } from "matrix-protection-suite";
import { UnlistedUserRedactionQueue } from "./queues/UnlistedUserRedactionQueue";
import { findCommandTable } from "./commands/interface-manager/InterfaceCommand";
import { ThrottlingQueue } from "./queues/ThrottlingQueue";
import ManagementRoomOutput from "./ManagementRoomOutput";
import { ReportPoller } from "./report/ReportPoller";
import { ReportManager } from "./report/ReportManager";
import { MatrixReactionHandler } from "./commands/interface-manager/MatrixReactionHandler";
import { MatrixSendClient, SynapseAdminClient, resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { IConfig } from "./config";
import { COMMAND_PREFIX, DraupnirContext, extractCommandFromMessageBody, handleCommand } from "./commands/CommandHandler";
import { renderProtectionFailedToStart } from "./StandardConsequenceProvider";
import { htmlEscape } from "./utils";
import { LogLevel } from "matrix-bot-sdk";
import { ARGUMENT_PROMPT_LISTENER, DEFAUILT_ARGUMENT_PROMPT_LISTENER, makeListenerForArgumentPrompt as makeListenerForArgumentPrompt, makeListenerForPromptDefault } from "./commands/interface-manager/MatrixPromptForAccept";

const log = new Logger('Draupnir');

// webAPIS should not be included on the Draupnir class.
// That should be managed elsewhere.
// It's not actually relevant to the Draupnir instance and it only was connected
// to Mjolnir because it needs to be started after Mjolnir started and not before.
// And giving it to the class was a dumb easy way of doing that.

export class Draupnir implements Client {
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

    public readonly commandContext: Omit<DraupnirContext,'event'>;

    private readonly timelineEventListener = this.handleTimelineEvent.bind(this);

    private constructor(
        public readonly client: MatrixSendClient,
        public readonly clientUserID: StringUserID,
        public readonly managementRoom: MatrixRoomID,
        public readonly clientRooms: ClientRooms,
        public readonly config: IConfig,
        public readonly protectedRoomsSet: ProtectedRoomsSet,
        public readonly roomStateManager: RoomStateManager,
        public readonly policyRoomManager: PolicyRoomManager,
        public readonly roomMembershipManager: RoomMembershipManager,
        public readonly synapseAdminClient?: SynapseAdminClient
    ) {
        this.managementRoomID = this.managementRoom.toRoomIDOrAlias();
        this.managementRoomOutput = new ManagementRoomOutput(
            this.managementRoomID, this.clientUserID, this.client, this.config
        );
        this.reactionHandler = new MatrixReactionHandler(this.managementRoom.toRoomIDOrAlias(), client, clientUserID);
        this.reportManager = new ReportManager(this);
        if (config.pollReports) {
            this.reportPoller = new ReportPoller(this, this.reportManager);
        }
        this.clientRooms.on('timeline', this.timelineEventListener);

        this.commandContext = {
            draupnir: this, roomID: this.managementRoomID, client: this.client, reactionHandler: this.reactionHandler,
        };
        this.reactionHandler.on(ARGUMENT_PROMPT_LISTENER, makeListenerForArgumentPrompt(
            this.client,
            this.managementRoomID,
            this.reactionHandler,
            this.commandTable,
            this.commandContext
        ));
        this.reactionHandler.on(DEFAUILT_ARGUMENT_PROMPT_LISTENER, makeListenerForPromptDefault(
            this.client,
            this.managementRoomID,
            this.reactionHandler,
            this.commandTable,
            this.commandContext
        ));
    }

    public static async makeDraupnirBot(
        client: MatrixSendClient,
        clientUserID: StringUserID,
        managementRoom: MatrixRoomID,
        clientRooms: ClientRooms,
        protectedRoomsSet: ProtectedRoomsSet,
        roomStateManager: RoomStateManager,
        policyRoomManager: PolicyRoomManager,
        roomMembershipManager: RoomMembershipManager,
        config: IConfig
    ): Promise<Draupnir> {
        const draupnir = new Draupnir(
            client,
            clientUserID,
            managementRoom,
            clientRooms,
            config,
            protectedRoomsSet,
            roomStateManager,
            policyRoomManager,
            roomMembershipManager,
            new SynapseAdminClient(
                client,
                clientUserID
            )
        );
        const loadResult = await protectedRoomsSet.protections.loadProtections(
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

    public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
        Task(this.joinOnInviteListener(roomID, event));
        this.managementRoomMessageListener(roomID, event);
        this.reactionHandler.handleEvent(roomID, event);
    }

    private managementRoomMessageListener(roomID: StringRoomID, event: RoomEvent): void {
        if (roomID !== this.managementRoomID) {
            return;
        }
        if (Value.Check(RoomMessage, event) && Value.Check(TextMessageContent, event.content)) {
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
    }

    /**
     * Adds a listener to the client that will automatically accept invitations.
     * FIXME: This is just copied in from Mjolnir and there are plenty of places for uncaught exceptions that will cause havok.
     * FIXME: MOVE TO A PROTECTION.
     * @param {MatrixSendClient} client
     * @param options By default accepts invites from anyone.
     * @param {string} options.managementRoom The room to report ignored invitations to if `recordIgnoredInvites` is true.
     * @param {boolean} options.recordIgnoredInvites Whether to report invites that will be ignored to the `managementRoom`.
     * @param {boolean} options.autojoinOnlyIfManager Whether to only accept an invitation by a user present in the `managementRoom`.
     * @param {string} options.acceptInvitesFromSpace A space of users to accept invites from, ignores invites form users not in this space.
     */
    private async joinOnInviteListener(roomID: StringRoomID, event: RoomEvent): Promise<void> {
        if (Value.Check(MembershipEvent, event) && event.state_key === this.clientUserID) {
            const inviteEvent = event;
            const reportInvite = async () => {
                if (!this.config.recordIgnoredInvites) return; // Nothing to do

                Task((async () => {
                    await this.client.sendMessage(this.managementRoomID, {
                        msgtype: "m.text",
                        body: `${inviteEvent.sender} has invited me to ${inviteEvent.room_id} but the config prevents me from accepting the invitation. `
                            + `If you would like this room protected, use "!mjolnir rooms add ${inviteEvent.room_id}" so I can accept the invite.`,
                        format: "org.matrix.custom.html",
                        formatted_body: `${htmlEscape(inviteEvent.sender)} has invited me to ${htmlEscape(inviteEvent.room_id)} but the config prevents me from `
                            + `accepting the invitation. If you would like this room protected, use <code>!mjolnir rooms add ${htmlEscape(inviteEvent.room_id)}</code> `
                            + `so I can accept the invite.`,
                    });
                    return Ok(undefined);
                })());
            };

            if (this.config.autojoinOnlyIfManager) {
                const managementMembership = this.protectedRoomsSet.setMembership.getRevision(this.managementRoomID);
                if (managementMembership === undefined) {
                    throw new TypeError(`Processing an invitation before the protected rooms set has properly initialized. Are we protecting the management room?`);
                }
                const senderMembership = managementMembership.membershipForUser(inviteEvent.sender);
                if (senderMembership?.membership !== Membership.Join) return reportInvite(); // ignore invite
            } else {
                if (!(isStringRoomID(this.config.acceptInvitesFromSpace) || isStringRoomAlias(this.config.acceptInvitesFromSpace))) {
                    // FIXME: We need to do StringRoomID stuff at parse time of the config.
                    throw new TypeError(`${this.config.acceptInvitesFromSpace} is not a valid room ID or Alias`);
                }
                const spaceReference = MatrixRoomReference.fromRoomIDOrAlias(this.config.acceptInvitesFromSpace);
                const spaceID = await resolveRoomReferenceSafe(this.client, spaceReference);
                if (isError(spaceID)) {
                    await this.managementRoomOutput.logMessage(LogLevel.ERROR, 'Draupnir', `Unable to resolve the space ${spaceReference.toPermalink} from config.acceptInvitesFromSpace when trying to accept an invitation from ${inviteEvent.sender}`);
                }
                const spaceId = await this.client.resolveRoom(this.config.acceptInvitesFromSpace);
                const spaceUserIds = await this.client.getJoinedRoomMembers(spaceId)
                    .catch(async e => {
                        if (e.body?.errcode === "M_FORBIDDEN") {
                            await this.managementRoomOutput.logMessage(LogLevel.ERROR, 'Mjolnir', `Mjolnir is not in the space configured for acceptInvitesFromSpace, did you invite it?`);
                            await this.client.joinRoom(spaceId);
                            return await this.client.getJoinedRoomMembers(spaceId);
                        } else {
                            return Promise.reject(e);
                        }
                    });
                if (!spaceUserIds.includes(inviteEvent.sender)) {
                    return reportInvite(); // ignore invite
                }
            }
            await this.client.joinRoom(roomID);
        }
    }

    public async start(): Promise<void> {
        // FIXME: This method needs to be removed it probably won't be called at all.
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
    public handleEventReport(report: EventReport): void {
        this.protectedRoomsSet.handleEventReport(report);
    }
}
