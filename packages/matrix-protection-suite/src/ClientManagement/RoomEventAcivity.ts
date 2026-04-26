// Copyright (C) 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { RoomEvent } from "../MatrixTypes/Events";
import { ConstantPeriodBatch } from "./ConstantPeriodBatch";

export type OnRoomEventActivity = (
  roomID: StringRoomID,
  events: RoomEvent[]
) => void;

/**
 * This is a helper to turn clients that give us a per event handler back into
 * something that bundles events together.
 * If you can avoid doing this by writing your own sync loop or `/transactions`
 * handler, then do so because this is going to suck a little.
 * https://github.com/Gnuxie/matrix-protection-suite/issues/14
 */
export class OnEventToOnRoomEventActivityConverter {
  private readonly eventsByRoom = new Map<StringRoomID, RoomEvent[]>();
  private batcher = new ConstantPeriodBatch(() => undefined);
  private readonly batchHandler = this.handleBatch.bind(this);
  public constructor(private readonly cb: OnRoomEventActivity) {
    // nothing to do.
  }

  private internRoomEvent(event: RoomEvent): void {
    const entry = this.eventsByRoom.get(event.room_id);
    if (entry === undefined) {
      this.eventsByRoom.set(event.room_id, [event]);
    } else {
      entry.push(event);
    }
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    if (this.batcher.isFinished()) {
      this.batcher = new ConstantPeriodBatch(this.batchHandler);
    }
    this.internRoomEvent(event);
  }

  private handleBatch(): void {
    for (const [roomID, events] of this.eventsByRoom.entries()) {
      this.cb(roomID, events);
    }
    this.eventsByRoom.clear();
  }
}
