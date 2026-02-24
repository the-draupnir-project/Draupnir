// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { Logger } from "../Logging/Logger";
import { RoomEvent } from "../MatrixTypes/Events";

const log = new Logger("RoomPauser");

type RoomPauseTaskCB = () => Promise<unknown>;
type RoomPauseThenCB = (roomID: StringRoomID, event: RoomEvent) => void;

/**
 * The room pauser allows `ClientRooms` to pause the processing of certain
 * rooms while we ensure a number of conditions about the room:
 * 1. That we are joined to the room.
 * 2. That we have available room state in the room state manager for the room.
 * 3. And that all member information is up to date.
 * 4. And that all policy information is up to date.
 * A room that is paused will still report isJoined.
 *
 * If informed of another membership event after pausing a room,
 * it will just end up in the pause queue.
 *
 * While We don't need to call joined_members to verify that we are joined to a room
 * upon seeing a join event (so long as we allow spurios joins from failing
 * to detect profile updates. The homeserver shouldn't be wrong about its own
 * membership.). I don't feel quite so confident that the bot can stay in sync.
 */
export interface RoomPauser {
  isRoomPaused(roomID: StringRoomID): boolean;
  pauseRoom(
    roomID: StringRoomID,
    task: RoomPauseTaskCB,
    then: RoomPauseThenCB
  ): void;
  handleTimelineEventInPausedRoom(roomID: StringRoomID, event: RoomEvent): void;
}

export class StandardRoomPauser implements RoomPauser {
  private readonly pausedRooms = new Map<StringRoomID, RoomEvent[]>();

  public isRoomPaused(roomID: StringRoomID): boolean {
    return this.pausedRooms.has(roomID);
  }

  private unpause(roomID: StringRoomID, then: RoomPauseThenCB): void {
    const entry = this.pausedRooms.get(roomID);
    if (entry === undefined) {
      throw new TypeError(
        `Someone is managing to pause a room twice, if this happens then the implementation of RoomPauser is broken`
      );
    }
    this.pausedRooms.delete(roomID);
    for (const event of entry) {
      then(roomID, event);
    }
  }

  public pauseRoom(
    roomID: StringRoomID,
    task: RoomPauseTaskCB,
    then: RoomPauseThenCB
  ): void {
    if (this.isRoomPaused(roomID)) {
      throw new TypeError(
        `Someone is trying to pause a room without checking if the room is paused, or they are awaiting between those calls`
      );
    }
    this.pausedRooms.set(roomID, []);
    task().then(
      () => {
        this.unpause(roomID, then);
      },
      (reason: unknown) => {
        log.error(
          `RoomPause task was rejected, this should not happen and the task should catch all exceptions.`,
          reason
        );
        throw reason;
      }
    );
  }
  public handleTimelineEventInPausedRoom(
    roomID: StringRoomID,
    event: RoomEvent
  ): void {
    const entry = this.pausedRooms.get(roomID);
    if (entry === undefined) {
      throw new TypeError(
        `Someone isn't checking that the room is paused before queing paused events.`
      );
    }
    entry.push(event);
  }
}
