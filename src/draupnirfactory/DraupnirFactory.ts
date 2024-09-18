// SPDX-FileCopyrightText: 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ActionResult,
  ClientsInRoomMap,
  Ok,
  StandardLoggableConfigTracker,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  ClientCapabilityFactory,
  ClientForUserID,
  RoomStateManagerFactory,
  joinedRoomsSafe,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import { IConfig } from "../config";
import { makeProtectedRoomsSet } from "./DraupnirProtectedRoomsSet";
import {
  StringUserID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { SafeModeDraupnir } from "../safemode/DraupnirSafeMode";
import { SafeModeCause } from "../safemode/SafeModeCause";
import { SafeModeToggle } from "../safemode/SafeModeToggle";

export class DraupnirFactory {
  public constructor(
    private readonly clientsInRoomMap: ClientsInRoomMap,
    private readonly clientCapabilityFactory: ClientCapabilityFactory,
    private readonly clientProvider: ClientForUserID,
    private readonly roomStateManagerFactory: RoomStateManagerFactory
  ) {
    // nothing to do.
  }

  public async makeDraupnir(
    clientUserID: StringUserID,
    managementRoom: MatrixRoomID,
    config: IConfig,
    toggle: SafeModeToggle
  ): Promise<ActionResult<Draupnir>> {
    const client = await this.clientProvider(clientUserID);
    const clientRooms = await this.clientsInRoomMap.makeClientRooms(
      clientUserID,
      async () => joinedRoomsSafe(client)
    );
    if (isError(clientRooms)) {
      return clientRooms;
    }
    const roomStateManager =
      await this.roomStateManagerFactory.getRoomStateManager(clientUserID);
    const policyRoomManager =
      await this.roomStateManagerFactory.getPolicyRoomManager(clientUserID);
    const roomMembershipManager =
      await this.roomStateManagerFactory.getRoomMembershipManager(clientUserID);
    const clientPlatform = this.clientCapabilityFactory.makeClientPlatform(
      clientUserID,
      client
    );
    const configLogTracker = new StandardLoggableConfigTracker();
    const protectedRoomsSet = await makeProtectedRoomsSet(
      managementRoom,
      roomStateManager,
      policyRoomManager,
      roomMembershipManager,
      client,
      clientPlatform,
      clientUserID,
      config,
      configLogTracker
    );
    if (isError(protectedRoomsSet)) {
      return protectedRoomsSet;
    }
    return await Draupnir.makeDraupnirBot(
      client,
      clientUserID,
      clientPlatform,
      managementRoom,
      clientRooms.ok,
      protectedRoomsSet.ok,
      roomStateManager,
      policyRoomManager,
      roomMembershipManager,
      config,
      configLogTracker,
      toggle
    );
  }

  public async makeSafeModeDraupnir(
    clientUserID: StringUserID,
    managementRoom: MatrixRoomID,
    config: IConfig,
    cause: SafeModeCause,
    toggle: SafeModeToggle
  ): Promise<ActionResult<SafeModeDraupnir>> {
    const client = await this.clientProvider(clientUserID);
    const clientRooms = await this.clientsInRoomMap.makeClientRooms(
      clientUserID,
      async () => joinedRoomsSafe(client)
    );
    if (isError(clientRooms)) {
      return clientRooms;
    }
    const clientPlatform = this.clientCapabilityFactory.makeClientPlatform(
      clientUserID,
      client
    );
    return Ok(
      new SafeModeDraupnir(
        cause,
        client,
        clientUserID,
        clientPlatform,
        managementRoom,
        clientRooms.ok,
        toggle,
        config
      )
    );
  }
}
