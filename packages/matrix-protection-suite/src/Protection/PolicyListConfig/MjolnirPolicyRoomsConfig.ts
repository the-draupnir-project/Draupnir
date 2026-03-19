// Copyright (C) 2023 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import AwaitLock from "await-lock";
import {
  PolicyListConfig,
  PolicyRoomWatchProfile,
  PropagationType,
} from "./PolicyListConfig";
import { RoomJoiner } from "../../Client/RoomJoiner";
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
  MjolnirPolicyRoomsDescription,
  MjolnirPolicyRoomsEncodedShape,
} from "./MjolnirPolicyRoomsDescription";
import { Map as PersistentMap } from "immutable";
import { Result, isError, Ok, ResultError } from "@gnuxie/typescript-result";

const log = new Logger("MjolnirPolicyRoomsConfig");

export class MjolnirPolicyRoomsConfig implements PolicyListConfig {
  private readonly writeLock = new AwaitLock();
  private constructor(
    private readonly config: PersistentConfigData<
      typeof MjolnirPolicyRoomsDescription.schema
    >,
    private readonly roomJoiner: RoomJoiner,
    private watchedLists: PersistentMap<StringRoomID, MatrixRoomID>
  ) {
    // nothing to do
  }

  public static async createFromStore(
    store: PersistentConfigBackend<MjolnirPolicyRoomsEncodedShape>,
    roomJoiner: RoomJoiner
  ): Promise<Result<MjolnirPolicyRoomsConfig>> {
    const config = new StandardPersistentConfigData(
      MjolnirPolicyRoomsDescription,
      store
    );
    const dataResult = await config.requestParsedConfig();
    if (isError(dataResult)) {
      return dataResult.elaborate(
        "Failed to load MjolnirPolicyRoomsConfig from account data"
      );
    }
    const data = dataResult.ok ?? config.description.getDefaultConfig();
    let watchedLists = PersistentMap<StringRoomID, MatrixRoomID>();
    for (const [i, reference] of data.references.entries()) {
      const joinResult = await roomJoiner.joinRoom(reference);
      if (isError(joinResult)) {
        log.info(`MjolnirPolicyRoomsConfig:`, data);
        return await config.reportUseError(
          "Unable to join policy room from a provided reference",
          {
            path: `/references/${i}`,
            value: reference,
            cause: joinResult.error,
          }
        );
      }
      watchedLists = watchedLists.set(
        joinResult.ok.toRoomIDOrAlias(),
        joinResult.ok
      );
    }
    return Ok(new MjolnirPolicyRoomsConfig(config, roomJoiner, watchedLists));
  }

  public get allWatchedLists(): PolicyRoomWatchProfile[] {
    return [...this.watchedLists.values()].map((room) => ({
      room,
      propagation: PropagationType.Direct,
    }));
  }

  public async watchList<T>(
    propagation: PropagationType,
    list: MatrixRoomID,
    _options: T
  ): Promise<Result<void>> {
    // More variants could be added under our feet as code changes:
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (propagation !== PropagationType.Direct) {
      return ResultError.Result(
        `The MjolnirProtectedRoomsConfig does not support watching a list ${list.toPermalink()} with propagation type ${propagation}.`
      );
    }
    const joinResult = await this.roomJoiner.joinRoom(list);
    if (isError(joinResult)) {
      return joinResult.elaborate(
        `Could not join the policy room in order to begin watching it.`
      );
    }
    await this.writeLock.acquireAsync();
    try {
      const storeUpdateResult = await this.config.saveConfig({
        references: [
          ...this.watchedLists.set(list.toRoomIDOrAlias(), list).values(),
        ],
      });
      if (isError(storeUpdateResult)) {
        return storeUpdateResult;
      }
      this.watchedLists = this.watchedLists.set(list.toRoomIDOrAlias(), list);
    } finally {
      this.writeLock.release();
    }
    return Ok(undefined);
  }
  public async unwatchList(
    propagation: PropagationType,
    list: MatrixRoomID
  ): Promise<Result<void>> {
    // More variants could be added under our feet as code changes:
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (propagation !== PropagationType.Direct) {
      return ResultError.Result(
        `The MjolnirProtectedRoomsConfigUnable does not support watching a list ${list.toPermalink()} with propagation type ${propagation}.`
      );
    }
    await this.writeLock.acquireAsync();
    try {
      const storeUpdateResult = await this.config.saveConfig({
        references: [
          ...this.watchedLists.delete(list.toRoomIDOrAlias()).values(),
        ],
      });
      if (isError(storeUpdateResult)) {
        return storeUpdateResult;
      }
      this.watchedLists = this.watchedLists.delete(list.toRoomIDOrAlias());
    } finally {
      this.writeLock.release();
    }
    return Ok(undefined);
  }
}
