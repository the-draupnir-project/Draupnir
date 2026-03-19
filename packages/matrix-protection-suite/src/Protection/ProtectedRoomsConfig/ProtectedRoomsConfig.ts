// Copyright 2019 2022 The Matrix.org Foundation C.I.C.
// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionResult, Ok, isError } from "../../Interface/Action";
import { MjolnirProtectedRoomsEvent } from "./MjolnirProtectedRoomsEvent";
import AwaitLock from "await-lock";
import {
  LoggableConfig,
  LoggableConfigTracker,
} from "../../Interface/LoggableConfig";
import { RoomResolver } from "../../Client/RoomResolver";
import { Logger } from "../../Logging/Logger";
import {
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  PersistentConfigBackend,
  PersistentConfigData,
  StandardPersistentConfigData,
} from "../../Config/PersistentConfigData";
import {
  MjolnirProtectedRoomsDescription,
  MjolnirProtectedRoomsEncodedShape,
} from "./MjolnirProtectedRoomsDescription";
import { ResultError } from "@gnuxie/typescript-result";

const log = new Logger("MjolnirProtectedroomsCofnig");

export interface ProtectedRoomsConfig {
  addRoom(room: MatrixRoomID): Promise<ActionResult<void>>;
  removeRoom(room: MatrixRoomID): Promise<ActionResult<void>>;
  getProtectedRooms(): MatrixRoomID[];
  reportUseError(
    message: string,
    room: MatrixRoomID,
    error: ResultError
  ): Promise<ActionResult<never>>;
}

export class MjolnirProtectedRoomsConfig
  implements ProtectedRoomsConfig, LoggableConfig
{
  private readonly writeLock = new AwaitLock();
  private constructor(
    private readonly config: PersistentConfigData<
      typeof MjolnirProtectedRoomsDescription.schema
    >,
    private readonly protectedRooms: Map<StringRoomID, MatrixRoomID>,
    /**
     * We use this so that we can keep track of the raw data for logging purposes.
     */
    private rawData: MjolnirProtectedRoomsEvent | undefined,
    loggableConfigTracker: LoggableConfigTracker
  ) {
    loggableConfigTracker.addLoggableConfig(this);
  }
  public static async createFromStore(
    store: PersistentConfigBackend<MjolnirProtectedRoomsEncodedShape>,
    resolver: RoomResolver,
    loggableConfigTracker: LoggableConfigTracker
  ): Promise<ActionResult<ProtectedRoomsConfig>> {
    const config = new StandardPersistentConfigData(
      MjolnirProtectedRoomsDescription,
      store
    );
    const dataResult = await config.requestParsedConfig();
    if (isError(dataResult)) {
      return dataResult.elaborate(
        `Failed to load ProtectedRoomsConfig when creating ProtectedRoomsConfig`
      );
    }
    const data = dataResult.ok ?? config.description.getDefaultConfig();
    const protectedRooms = new Map<StringRoomID, MatrixRoomID>();
    for (const [i, ref] of data.rooms.entries()) {
      const resolvedRef = await resolver.resolveRoom(ref);
      if (isError(resolvedRef)) {
        log.info(`Current config`, data);
        return await config.reportUseError("Unable to resolve room reference", {
          path: `/rooms/${i}`,
          value: ref,
          cause: resolvedRef.error,
        });
      }
      protectedRooms.set(resolvedRef.ok.toRoomIDOrAlias(), resolvedRef.ok);
    }
    return Ok(
      new MjolnirProtectedRoomsConfig(
        config,
        protectedRooms,
        data,
        loggableConfigTracker
      )
    );
  }

  public getProtectedRooms(): MatrixRoomID[] {
    return [...this.protectedRooms.values()];
  }
  public logCurrentConfig(): void {
    log.info("Current config", this.rawData);
  }
  public async addRoom(room: MatrixRoomID): Promise<ActionResult<void>> {
    await this.writeLock.acquireAsync();
    try {
      // We would still like to persist the rooms even if the one being added is already there.
      // This is just to make sure the account data is consistent with what's represented in the model.
      // No, I don't know whether this is justified or not.
      const data = {
        rooms: [
          ...this.protectedRooms.keys(),
          ...(this.protectedRooms.has(room.toRoomIDOrAlias())
            ? []
            : [room.toRoomIDOrAlias()]),
        ],
      };
      const result = await this.config.saveConfig(data);
      if (isError(result)) {
        return result.elaborate(
          `Failed to add ${room.toPermalink()} to protected rooms set.`
        );
      }
      this.protectedRooms.set(room.toRoomIDOrAlias(), room);
      this.rawData = data;
      return Ok(undefined);
    } finally {
      this.writeLock.release();
    }
  }
  public async removeRoom(room: MatrixRoomID): Promise<ActionResult<void>> {
    await this.writeLock.acquireAsync();
    try {
      const data = {
        rooms: this.getProtectedRooms()
          .map((ref) => ref.toRoomIDOrAlias())
          .filter((roomID) => roomID !== room.toRoomIDOrAlias()),
      };
      const result = await this.config.saveConfig(data);
      if (isError(result)) {
        return result.elaborate(
          `Failed to remove ${room.toPermalink()} to protected rooms set.`
        );
      }
      this.protectedRooms.delete(room.toRoomIDOrAlias());
      this.rawData = data;
      return Ok(undefined);
    } finally {
      this.writeLock.release();
    }
  }

  public async reportUseError(
    message: string,
    room: MatrixRoomID,
    error: ResultError
  ): Promise<ActionResult<never>> {
    return await this.config.reportUseError(message, {
      path: `/rooms/${this.getProtectedRooms().indexOf(room)}`,
      value: room,
      cause: error,
    });
  }
}
