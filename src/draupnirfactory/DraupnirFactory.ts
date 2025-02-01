// SPDX-FileCopyrightText: 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ActionResult,
  ClientsInRoomMap,
  Logger,
  Ok,
  StandardLoggableConfigTracker,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  ClientCapabilityFactory,
  ClientForUserID,
  MatrixSendClient,
  RoomStateManagerFactory,
  joinedRoomsSafe,
  resultifyBotSDKRequestErrorWith404AsUndefined,
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
import { StandardManagementRoomDetail } from "../managementroom/ManagementRoomDetail";

const log = new Logger("DraupnirFactory");

async function safelyFetchProfile(
  client: MatrixSendClient,
  clientUserID: StringUserID
): Promise<{ displayname?: string } | undefined> {
  const clientProfileResult = await client.getUserProfile(clientUserID).then(
    (value) => Ok(value),
    (error) => resultifyBotSDKRequestErrorWith404AsUndefined(error)
  );
  // We opt to report to the log rather than fail outright. Because this is on the critical startup path
  // and when we did crash, we had unexplained server behaviour https://github.com/the-draupnir-project/Draupnir/issues/703
  if (isError(clientProfileResult)) {
    log.error(
      "Unable to fetch Draupnir's profile information, please report this error to the developers",
      clientProfileResult.error
    );
    return undefined;
  } else {
    return clientProfileResult.ok;
  }
}

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
    const managementRoomMembership =
      await this.roomStateManagerFactory.getRoomMembershipRevisionIssuer(
        managementRoom,
        clientUserID
      );
    if (isError(managementRoomMembership)) {
      return managementRoomMembership.elaborate(
        "Failed to get room membership revision issuer for the management room"
      );
    }
    const managementRoomState =
      await this.roomStateManagerFactory.getRoomStateRevisionIssuer(
        managementRoom,
        clientUserID
      );
    if (isError(managementRoomState)) {
      return managementRoomState.elaborate(
        "Failed to get room state revision issuer for the management room"
      );
    }
    const managementRoomDetail = new StandardManagementRoomDetail(
      managementRoom,
      managementRoomMembership.ok,
      managementRoomState.ok
    );
    const clientProfile = await safelyFetchProfile(client, clientUserID);
    return await Draupnir.makeDraupnirBot(
      client,
      clientUserID,
      clientProfile?.displayname ?? clientUserID,
      clientPlatform,
      managementRoomDetail,
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
    const clientProfile = await safelyFetchProfile(client, clientUserID);
    return Ok(
      new SafeModeDraupnir(
        cause,
        client,
        clientUserID,
        clientProfile?.displayname ?? clientUserID,
        clientPlatform,
        managementRoom,
        clientRooms.ok,
        toggle,
        config
      )
    );
  }
}
