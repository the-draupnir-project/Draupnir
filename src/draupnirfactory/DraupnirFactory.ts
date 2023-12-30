/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionResult, ClientRooms, ClientsInRoomMap, InternedInstanceFactory, MatrixRoomID, Ok, PolicyRoomManager, RoomEvent, RoomMembershipManager, RoomStateManager, StandardClientsInRoomMap, StringRoomID, StringUserID, isError } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { ClientForUserID, MatrixSendClient, RoomStateManagerFactory, joinedRoomsSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DraupnirClientRooms } from "./DraupnirClientRooms";
import { IConfig } from "../config";

interface DraupnirFactory {
    clientsInRoomMap: ClientsInRoomMap;
    getDraupnir(
      clientUserID: StringUserID,
      managementRoom: MatrixRoomID,
      config: IConfig
    ): Promise<ActionResult<Draupnir>>;
}

export class StandardDraupnirFactory implements DraupnirFactory {
    public readonly clientsInRoomMap = new StandardClientsInRoomMap();
    private readonly draupnirs: InternedInstanceFactory<StringUserID, Draupnir, [MatrixRoomID, IConfig]> = new InternedInstanceFactory(
        async (clientUserID, managementRoom, config) => {
            const roomStateManager = await this.roomStateManagerFactory.getRoomStateManager(clientUserID);
            const policyRoomManager = await this.roomStateManagerFactory.getPolicyRoomManager(clientUserID);
            const roomMembershipManager = await this.roomStateManagerFactory.getRoomMembershipManager(clientUserID);
            const client = await this.clientProvider(clientUserID);
            const clientRooms = await this.makeClientRooms(clientUserID, client, managementRoom, roomStateManager, policyRoomManager, roomMembershipManager);
            if (isError(clientRooms)) {
                return clientRooms;
            }
            this.clientsInRoomMap.addClientRooms(clientRooms.ok);
            return Ok(await Draupnir.makeDraupnirBot(
                client,
                clientUserID,
                clientRooms.ok,
                managementRoom,
                clientRooms.ok.protectedRoomsSets[0],
                roomStateManager,
                policyRoomManager,
                roomMembershipManager,
                config
            ))
        }
    )

    public constructor(
        private readonly clientProvider: ClientForUserID,
        private readonly roomStateManagerFactory: RoomStateManagerFactory
    ) {
        // nothing to do.
    }

    public async getDraupnir(clientUserID: StringUserID, managementRoom: MatrixRoomID, config: IConfig): Promise<ActionResult<Draupnir>> {
        return await this.draupnirs.getInstance(clientUserID, managementRoom, config);
    }

    public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
        this.roomStateManagerFactory.handleTimelineEvent(roomID, event);
        for (const draupnir of this.draupnirs.allInstances()) {
            if (this.clientsInRoomMap.isClientInRoom(draupnir.clientUserID, roomID) || ('state_key' in event && draupnir.clientUserID === event.state_key)) {
                // TODO: it would be nicer if somehow clientRooms can handle this, and finding which clients to inform.
                // and also how to inform Draupnir.
                draupnir.handleTimelineEvent(roomID, event);
                draupnir.clientRooms.handleTimelineEvent(roomID, event);
            }
        }
    }

    private async makeClientRooms(
        clientUserID: StringUserID,
        client: MatrixSendClient,
        managementRoom: MatrixRoomID,
        roomStateManager: RoomStateManager,
        policyRoomManager: PolicyRoomManager,
        roomMembershipManager: RoomMembershipManager
    ): Promise<ActionResult<ClientRooms>> {
        return await DraupnirClientRooms.makeClientRooms(
            client,
            managementRoom,
            async () => joinedRoomsSafe(client),
            clientUserID,
            roomStateManager,
            policyRoomManager,
            roomMembershipManager
        )
    }
}
