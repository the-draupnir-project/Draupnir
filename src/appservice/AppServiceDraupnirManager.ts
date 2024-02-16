/**
 * Copyright (C) 2022-2024 Gnuxie <Gnuxie@protonmail.com>
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

import { Bridge, Intent, Logger } from "matrix-appservice-bridge";
import { getProvisionedMjolnirConfig } from "../config";
import { MatrixClient } from "matrix-bot-sdk";
import { DataStore, MjolnirRecord } from "./datastore";
import { AccessControl } from "./AccessControl";
import { randomUUID } from "crypto";
import { Gauge } from "prom-client";
import { decrementGaugeValue, incrementGaugeValue } from "../utils";
import { Access, ActionError, ActionException, ActionExceptionKind, ActionResult, MatrixRoomReference, Ok, PropagationType, StringRoomID, StringUserID, Task, isError, isStringRoomID, userLocalpart } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { ClientCapabilityFactory, RoomStateManagerFactory } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DraupnirFailType, StandardDraupnirManager, UnstartedDraupnir } from "../draupnirfactory/StandardDraupnirManager";
import { DraupnirFactory } from "../draupnirfactory/DraupnirFactory";

const log = new Logger('AppServiceDraupnirManager');


/**
 * The DraupnirManager is responsible for:
 * * Provisioning new draupnir instances.
 * * Starting draupnir when the appservice is brought online.
 * * Informing draupnir about new events.
 */
export class AppServiceDraupnirManager {

    private readonly baseManager: StandardDraupnirManager;

    private constructor(
        private readonly serverName: string,
        private readonly dataStore: DataStore,
        private readonly bridge: Bridge,
        private readonly accessControl: AccessControl,
        private readonly roomStateManagerFactory: RoomStateManagerFactory,
        private readonly clientCapabilityFactory: ClientCapabilityFactory,
        private readonly instanceCountGauge: Gauge<"status" | "uuid">
    ) {
        const clientProvider = this.bridge.getIntent.bind(this.bridge);
        const draupnirFactory = new DraupnirFactory(
            this.roomStateManagerFactory.clientsInRoomMap,
            this.clientCapabilityFactory,
            clientProvider,
            this.roomStateManagerFactory
        );
        this.baseManager = new StandardDraupnirManager(
            draupnirFactory,
            roomStateManagerFactory.clientsInRoomMap
        );
    }

    public draupnirMXID(mjolnirRecord: MjolnirRecord): StringUserID {
        return `${mjolnirRecord.local_part}:${this.serverName}` as StringUserID;
    }

    /**
     * Create the draupnir manager from the datastore and the access control.
     * @param dataStore The data store interface that has the details for provisioned draupnirs.
     * @param bridge The bridge abstraction that encapsulates details about the appservice.
     * @param accessControl Who has access to the bridge.
     * @returns A new mjolnir manager.
     */
    public static async makeDraupnirManager(
        serverName: string,
        dataStore: DataStore,
        bridge: Bridge,
        accessControl: AccessControl,
        roomStateManagerFactory: RoomStateManagerFactory,
        clientCapabilityFactory: ClientCapabilityFactory,
        instanceCountGauge: Gauge<"status" | "uuid">
    ): Promise<AppServiceDraupnirManager> {
        const draupnirManager = new AppServiceDraupnirManager(
            serverName,
            dataStore,
            bridge,
            accessControl,
            roomStateManagerFactory,
            clientCapabilityFactory,
            instanceCountGauge
        );
        await draupnirManager.startDraupnirs(await dataStore.list());
        return draupnirManager;
    }

    /**
     * Creates a new mjolnir for a user.
     * @param requestingUserID The user that is requesting this mjolnir and who will own it.
     * @param managementRoomId An existing matrix room to act as the management room.
     * @param client A client for the appservice virtual user that the new mjolnir should use.
     * @returns A new managed mjolnir.
     */
    public async makeInstance(localPart: string, requestingUserID: StringUserID, managementRoomID: StringRoomID, client: MatrixClient): Promise<ActionResult<Draupnir>> {
        const mxid = await client.getUserId() as StringUserID;
        const managedDraupnir = await this.baseManager.makeDraupnir(
            mxid,
            MatrixRoomReference.fromRoomID(managementRoomID),
            getProvisionedMjolnirConfig(managementRoomID)
        );
        if (isError(managedDraupnir)) {
            return managedDraupnir;
        }
        this.baseManager.startDraupnir(mxid);
        incrementGaugeValue(this.instanceCountGauge, "offline", localPart);
        decrementGaugeValue(this.instanceCountGauge, "disabled", localPart);
        incrementGaugeValue(this.instanceCountGauge, "online", localPart);
        return managedDraupnir;
    }

    /**
     * Gets a draupnir for the corresponding mxid that is owned by a specific user.
     * @param draupnirID The mxid of the draupnir we are trying to get.
     * @param ownerID The owner of the draupnir. We ask for it explicitly to not leak access to another user's draupnir.
     * @returns The matching managed draupnir instance.
     */
    public async getRunningDraupnir(draupnirClientID: StringUserID, ownerID: StringUserID): Promise<Draupnir | undefined> {
        const records = await this.dataStore.lookupByOwner(ownerID);
        if (records.length === 0) {
            return undefined;
        }
        const associatedRecord = records.find(record => record.local_part === userLocalpart(draupnirClientID));
        if (associatedRecord === undefined || associatedRecord.owner !== ownerID) {
            return undefined;
        }
        return this.baseManager.findRunningDraupnir(draupnirClientID);
    }

    /**
     * Find all of the running Draupnir that are owned by this specific user.
     * @param ownerID An owner of multiple draupnir.
     * @returns Any draupnir that they own.
     */
    public async getOwnedDraupnir(ownerID: StringUserID): Promise<StringUserID[]> {
        const records = await this.dataStore.lookupByOwner(ownerID);
        return records.map(record => this.draupnirMXID(record));
    }

    /**
     * provision a new Draupnir for a matrix user.
     * @param requestingUserID The mxid of the user we are creating a Draupnir for.
     * @returns The matrix id of the new Draupnir and its management room.
     */
    public async provisionNewDraupnir(requestingUserID: StringUserID): Promise<ActionResult<MjolnirRecord>> {
        const access = this.accessControl.getUserAccess(requestingUserID);
        if (access.outcome !== Access.Allowed) {
            return ActionError.Result(`${requestingUserID} tried to provision a draupnir when they do not have access ${access.outcome} ${access.rule?.reason ?? 'no reason specified'}`);
        }
        const provisionedMjolnirs = await this.dataStore.lookupByOwner(requestingUserID);
        if (provisionedMjolnirs.length === 0) {
            const mjolnirLocalPart = `draupnir_${randomUUID()}`;
            const mjIntent = await this.makeMatrixIntent(mjolnirLocalPart);

            const managementRoomID = await mjIntent.matrixClient.createRoom({
                preset: 'private_chat',
                invite: [requestingUserID],
                name: `${requestingUserID}'s Draupnir`,
                power_level_content_override: {
                    users: {
                        [requestingUserID]: 100,
                        // Give the mjolnir a higher PL so that can avoid issues with managing the management room.
                        [await mjIntent.matrixClient.getUserId()]: 101
                    }
                }
            });
            if (!isStringRoomID(managementRoomID)) {
                throw new TypeError(`${managementRoomID} malformed managmentRoomID`);
            }
            const draupnir = await this.makeInstance(mjolnirLocalPart, requestingUserID, managementRoomID, mjIntent.matrixClient);
            if (isError(draupnir)) {
                return draupnir;
            }
            const policyListResult = await createFirstList(draupnir.ok, requestingUserID, "list");
            if (isError(policyListResult)) {
                return policyListResult;
            }
            const record = {
                local_part: mjolnirLocalPart,
                owner: requestingUserID,
                management_room: managementRoomID,
            } as MjolnirRecord;
            await this.dataStore.store(record);
            return Ok(record);
        } else {
            return ActionError.Result(`User: ${requestingUserID} has already provisioned ${provisionedMjolnirs.length} draupnirs.`);
        }
    }

    public getUnstartedDraupnirs(): UnstartedDraupnir[] {
        return this.baseManager.getUnstartedDraupnirs();
    }

    public findUnstartedDraupnir(clientUserID: StringUserID): UnstartedDraupnir | undefined {
        return this.baseManager.findUnstartedDraupnir(clientUserID);
    }

    /**
     * Utility that creates a matrix client for a virtual user on our homeserver with the specified loclapart.
     * @param localPart The localpart of the virtual user we need a client for.
     * @returns A bridge intent with the complete mxid of the virtual user and a MatrixClient.
     */
    private async makeMatrixIntent(localPart: string): Promise<Intent> {
        const mjIntent = this.bridge.getIntentFromLocalpart(localPart);
        await mjIntent.ensureRegistered();
        return mjIntent;
    }

    public async startDraupnirFromMXID(draupnirClientID: StringUserID): Promise<ActionResult<void>> {
        const records = await this.dataStore.lookupByLocalPart(userLocalpart(draupnirClientID));
        if (records.length === 0) {
            return ActionError.Result(`There is no record of a draupnir with the mxid ${draupnirClientID}`);
        } else {
            return await this.startDraupnirFromRecord(records[0]);
        }
    }

    /**
     * Attempt to start a mjolnir, and notify its management room of any failure to start.
     * Will be added to `this.unstartedMjolnirs` if we fail to start it AND it is not already running.
     * @param mjolnirRecord The record for the mjolnir that we want to start.
     */
    public async startDraupnirFromRecord(mjolnirRecord: MjolnirRecord): Promise<ActionResult<void>> {
        const clientUserID = this.draupnirMXID(mjolnirRecord);
        if (this.baseManager.isDraupnirListening(clientUserID)) {
            throw new TypeError(`${mjolnirRecord.local_part} is already running, we cannot start it.`);
        }
        const mjIntent = await this.makeMatrixIntent(mjolnirRecord.local_part);
        const access = this.accessControl.getUserAccess(mjolnirRecord.owner);
        if (access.outcome !== Access.Allowed) {
            // Don't await, we don't want to clobber initialization just because we can't tell someone they're no longer allowed.
            Task((async () => {
                mjIntent.matrixClient.sendNotice(mjolnirRecord.management_room, `Your draupnir has been disabled by the administrator: ${access.rule?.reason ?? "no reason supplied"}`);
            })());
            this.baseManager.reportUnstartedDraupnir(DraupnirFailType.Unauthorized, access.outcome, clientUserID);
            decrementGaugeValue(this.instanceCountGauge, "online", mjolnirRecord.local_part);
            incrementGaugeValue(this.instanceCountGauge, "disabled", mjolnirRecord.local_part);
            return ActionError.Result(`Tried to start a draupnir that has been disabled by the administrator: ${access.rule?.reason ?? 'no reason supplied'}`);
        } else {
            const startResult = await this.makeInstance(
                mjolnirRecord.local_part,
                mjolnirRecord.owner,
                mjolnirRecord.management_room,
                mjIntent.matrixClient,
            ).catch((e) => {
                log.error(`Could not start mjolnir ${mjolnirRecord.local_part} for ${mjolnirRecord.owner}:`, e);
                this.baseManager.reportUnstartedDraupnir(DraupnirFailType.StartError, e, clientUserID);
                return ActionException.Result(`Could not start draupnir ${clientUserID} for owner ${mjolnirRecord.owner}`, {
                    exception: e,
                    exceptionKind: ActionExceptionKind.Unknown
                })
            });
            if (isError(startResult)) {
                // Don't await, we don't want to clobber initialization if this fails.
                Task((async () => {
                    mjIntent.matrixClient.sendNotice(mjolnirRecord.management_room, `Your draupnir could not be started. Please alert the administrator`);
                })());
                decrementGaugeValue(this.instanceCountGauge, "online", mjolnirRecord.local_part);
                incrementGaugeValue(this.instanceCountGauge, "offline", mjolnirRecord.local_part);
                return startResult;
            }
            return Ok(undefined);
        }
    }

    // TODO: We need to check that an owner still has access to the appservice each time they send a command to the mjolnir or use the web api.
    // https://github.com/matrix-org/mjolnir/issues/410
    /**
     * Used at startup to create all the ManagedMjolnir instances and start them so that they will respond to users.
     */
    public async startDraupnirs(mjolnirRecords: MjolnirRecord[]): Promise<void> {
        for (const mjolnirRecord of mjolnirRecords) {
            await this.startDraupnirFromRecord(mjolnirRecord);
        }
    }
}

async function createFirstList(draupnir: Draupnir, draupnirOwnerID: StringUserID, shortcode: string): Promise<ActionResult<void>> {
    const policyRoom = await draupnir.policyRoomManager.createPolicyRoom(
        shortcode,
        [draupnirOwnerID],
        { name: `${draupnirOwnerID}'s policy room` }
    );
    if (isError(policyRoom)) {
        throw policyRoom.error;
    }
    const addRoomResult = await draupnir.protectedRoomsSet.protectedRoomsConfig.addRoom(policyRoom.ok);
    if (isError(addRoomResult)) {
        return addRoomResult;
    }
    return await draupnir.protectedRoomsSet.issuerManager.watchList(PropagationType.Direct, policyRoom.ok, {});
}
