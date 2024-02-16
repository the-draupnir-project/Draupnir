/**
 * Copyright (C) 2023-2024 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionResult, ClientsInRoomMap, MatrixRoomID, Ok, StringUserID, isError } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { ClientCapabilityFactory, ClientForUserID, RoomStateManagerFactory, joinedRoomsSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DraupnirClientRooms } from "./DraupnirClientRooms";
import { IConfig } from "../config";
import { makeProtectedRoomsSet } from "./DraupnirProtectedRoomsSet";

export class DraupnirFactory {
    public constructor(
        private readonly clientsInRoomMap: ClientsInRoomMap,
        private readonly clientCapabilityFactory: ClientCapabilityFactory,
        private readonly clientProvider: ClientForUserID,
        private readonly roomStateManagerFactory: RoomStateManagerFactory
    ) {
        // nothing to do.
    }

    public async makeDraupnir(clientUserID: StringUserID, managementRoom: MatrixRoomID, config: IConfig): Promise<ActionResult<Draupnir>> {
        const roomStateManager = await this.roomStateManagerFactory.getRoomStateManager(clientUserID);
        const policyRoomManager = await this.roomStateManagerFactory.getPolicyRoomManager(clientUserID);
        const roomMembershipManager = await this.roomStateManagerFactory.getRoomMembershipManager(clientUserID);
        const client = await this.clientProvider(clientUserID);
        const clientRooms = await DraupnirClientRooms.makeClientRooms(
            roomStateManager,
            async () => joinedRoomsSafe(client),
            clientUserID
        );
        if (isError(clientRooms)) {
            return clientRooms;
        }
        this.clientsInRoomMap.addClientRooms(clientRooms.ok);
        const protectedRoomsSet = await makeProtectedRoomsSet(
            managementRoom,
            roomStateManager,
            policyRoomManager,
            roomMembershipManager,
            client,
            clientUserID
        );
        if (isError(protectedRoomsSet)) {
            return protectedRoomsSet;
        }
        const clientPlatform = this.clientCapabilityFactory.makeClientPlatform(clientUserID, client);
        return Ok(await Draupnir.makeDraupnirBot(
            client,
            clientUserID,
            clientPlatform,
            managementRoom,
            clientRooms.ok,
            protectedRoomsSet.ok,
            roomStateManager,
            policyRoomManager,
            roomMembershipManager,
            config
        ))
    }
}
