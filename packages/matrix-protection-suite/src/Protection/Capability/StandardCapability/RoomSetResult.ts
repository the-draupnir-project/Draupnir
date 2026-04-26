// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult, isError } from "../../../Interface/Action";

export interface SetResult {
  readonly isEveryResultOk: boolean;
  readonly numberOfFailedResults: number;
}

export interface StringTypeResult<T extends string> extends SetResult {
  readonly map: Map<T, ActionResult<void>>;
}

export class StringTypeResultBuilder<T extends string> {
  private isEveryResultOk = true;
  private numberOfFailedResults = 0;
  private map = new Map<T, ActionResult<void>>();

  public addResult(key: T, result: ActionResult<void>): this {
    if (isError(result)) {
      this.numberOfFailedResults += 1;
      this.isEveryResultOk = false;
    }
    this.map.set(key, result);
    return this;
  }

  public getResult(): StringTypeResult<T> {
    return {
      isEveryResultOk: this.isEveryResultOk,
      numberOfFailedResults: this.numberOfFailedResults,
      map: this.map,
    };
  }
}

export type RoomSetResult = StringTypeResult<StringRoomID>;
export type RoomSetResultBuilder = StringTypeResultBuilder<StringRoomID>;
export const RoomSetResultBuilder = StringTypeResultBuilder<StringRoomID>;

export type ResultForUsersInRoom = StringTypeResult<StringUserID>;
export type ResultForUsersInRoomBuilder = StringTypeResultBuilder<StringUserID>;
export const ResultForUsersInRoomBuilder =
  StringTypeResultBuilder<StringUserID>;

export interface ResultForUsersInSet extends SetResult {
  readonly map: Map<StringUserID, RoomSetResult>;
}

export class ResultForUsersInSetBuilder {
  private isEveryResultOk = true;
  private numberOfFailedResults = 0;
  private map = new Map<StringUserID, RoomSetResultBuilder>();

  public addResult(
    userID: StringUserID,
    roomID: StringRoomID,
    result: ActionResult<void>
  ): this {
    if (isError(result)) {
      this.numberOfFailedResults += 1;
      this.isEveryResultOk = false;
    }
    const entry = this.map.get(userID);
    if (entry === undefined) {
      this.map.set(
        userID,
        new RoomSetResultBuilder().addResult(roomID, result)
      );
    } else {
      entry.addResult(roomID, result);
    }
    return this;
  }

  public getResult(): ResultForUsersInSet {
    return {
      isEveryResultOk: this.isEveryResultOk,
      numberOfFailedResults: this.numberOfFailedResults,
      map: [...this.map.entries()].reduce(
        (nextMap, [userID, roomSetResultBuilder]) => {
          nextMap.set(userID, roomSetResultBuilder.getResult());
          return nextMap;
        },
        new Map<StringUserID, RoomSetResult>()
      ),
    };
  }
}
