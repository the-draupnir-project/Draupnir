// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  StandardClientsInRoomMap,
  DefaultEventDecoder,
  setGlobalLoggerProvider,
  RoomStateBackingStore,
  ClientsInRoomMap,
  Task,
} from "matrix-protection-suite";
import {
  BotSDKLogServiceLogger,
  ClientCapabilityFactory,
  MatrixSendClient,
  RoomStateManagerFactory,
  SafeMatrixEmitter,
  joinedRoomsSafe,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import { IConfig } from "./config";
import { Draupnir } from "./Draupnir";
import { DraupnirFactory } from "./draupnirfactory/DraupnirFactory";
import { WebAPIs } from "./webapis/WebAPIs";
import {
  isStringUserID,
  isStringRoomAlias,
  isStringRoomID,
  MatrixRoomReference,
  StringUserID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { Result, isError } from "@gnuxie/typescript-result";
import {
  SafeModeToggle,
  SafeModeToggleOptions,
} from "./safemode/SafeModeToggle";
import { SafeModeDraupnir } from "./safemode/DraupnirSafeMode";
import { ResultError } from "@gnuxie/typescript-result";
import { SafeModeCause } from "./safemode/SafeModeCause";

setGlobalLoggerProvider(new BotSDKLogServiceLogger());

export function constructWebAPIs(draupnir: Draupnir): WebAPIs {
  return new WebAPIs(draupnir.reportManager, draupnir.config);
}

export class DraupnirBotModeToggle implements SafeModeToggle {
  private draupnir: Draupnir | null = null;
  private safeModeDraupnir: SafeModeDraupnir | null = null;

  private constructor(
    private readonly clientUserID: StringUserID,
    private readonly managementRoom: MatrixRoomID,
    private readonly clientsInRoomMap: ClientsInRoomMap,
    private readonly roomStateManagerFactory: RoomStateManagerFactory,
    private readonly draupnirFactory: DraupnirFactory,
    private readonly matrixEmitter: SafeMatrixEmitter,
    private readonly config: IConfig
  ) {
    this.matrixEmitter.on("room.invite", (roomID, event) => {
      this.clientsInRoomMap.handleTimelineEvent(roomID, event);
    });
    this.matrixEmitter.on("room.event", (roomID, event) => {
      this.roomStateManagerFactory.handleTimelineEvent(roomID, event);
      this.clientsInRoomMap.handleTimelineEvent(roomID, event);
    });
  }
  public static async create(
    client: MatrixSendClient,
    matrixEmitter: SafeMatrixEmitter,
    config: IConfig,
    backingStore?: RoomStateBackingStore
  ): Promise<DraupnirBotModeToggle> {
    const clientUserID = await client.getUserId();
    if (!isStringUserID(clientUserID)) {
      throw new TypeError(`${clientUserID} is not a valid mxid`);
    }
    if (
      !isStringRoomAlias(config.managementRoom) &&
      !isStringRoomID(config.managementRoom)
    ) {
      throw new TypeError(
        `${config.managementRoom} is not a valid room id or alias`
      );
    }
    const configManagementRoomReference = MatrixRoomReference.fromRoomIDOrAlias(
      config.managementRoom
    );
    const clientsInRoomMap = new StandardClientsInRoomMap();
    const clientCapabilityFactory = new ClientCapabilityFactory(
      clientsInRoomMap,
      DefaultEventDecoder
    );
    // needed to have accurate join infomration.
    (
      await clientsInRoomMap.makeClientRooms(clientUserID, async () =>
        joinedRoomsSafe(client)
      )
    ).expect("Unable to create ClientRooms");
    const clientPlatform = clientCapabilityFactory.makeClientPlatform(
      clientUserID,
      client
    );
    const managementRoom = (
      await clientPlatform
        .toRoomResolver()
        .resolveRoom(configManagementRoomReference)
    ).expect("Unable to resolve Draupnir's management room");
    (await clientPlatform.toRoomJoiner().joinRoom(managementRoom)).expect(
      "Unable to join Draupnir's management room"
    );
    const clientProvider = async (userID: StringUserID) => {
      if (userID !== clientUserID) {
        throw new TypeError(`Bot mode shouldn't be requesting any other mxids`);
      }
      return client;
    };
    const roomStateManagerFactory = new RoomStateManagerFactory(
      clientsInRoomMap,
      clientProvider,
      DefaultEventDecoder,
      backingStore
    );
    const draupnirFactory = new DraupnirFactory(
      clientsInRoomMap,
      clientCapabilityFactory,
      clientProvider,
      roomStateManagerFactory
    );
    return new DraupnirBotModeToggle(
      clientUserID,
      managementRoom,
      clientsInRoomMap,
      roomStateManagerFactory,
      draupnirFactory,
      matrixEmitter,
      config
    );
  }
  public async switchToDraupnir(
    options?: SafeModeToggleOptions
  ): Promise<Result<Draupnir>> {
    if (this.draupnir !== null) {
      return ResultError.Result(
        `There is a draupnir for ${this.clientUserID} already running`
      );
    }
    const draupnirResult = await this.draupnirFactory.makeDraupnir(
      this.clientUserID,
      this.managementRoom,
      this.config,
      this
    );
    if (isError(draupnirResult)) {
      return draupnirResult;
    }
    this.safeModeDraupnir?.stop();
    this.safeModeDraupnir = null;
    this.draupnir = draupnirResult.ok;
    void Task(this.draupnir.start());
    if (options?.sendStatusOnStart) {
      void Task(this.draupnir.startupComplete());
    }
    return draupnirResult;
  }
  public async switchToSafeMode(
    cause: SafeModeCause
  ): Promise<Result<SafeModeDraupnir>> {
    if (this.safeModeDraupnir !== null) {
      return ResultError.Result(
        `There is a safe mode draupnir for ${this.clientUserID} already running`
      );
    }
    const safeModeResult = await this.draupnirFactory.makeSafeModeDraupnir(
      this.clientUserID,
      this.managementRoom,
      this.config,
      cause,
      this
    );
    if (isError(safeModeResult)) {
      return safeModeResult;
    }
    this.draupnir?.stop();
    this.draupnir = null;
    this.safeModeDraupnir = safeModeResult.ok;
    this.safeModeDraupnir.start();
    return safeModeResult;
  }
}
