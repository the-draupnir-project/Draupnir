// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { RoomEvent, StringRoomID } from "matrix-protection-suite";

/**
 * Used to keep track of protected rooms so they are always ordered for activity.
 *
 * We use the same method as Element web for this, the major disadvantage being that we sort on each access to the room list (sort by most recently active first).
 * We have tried to mitigate this by caching the sorted list until the activity in rooms changes again.
 * See https://github.com/matrix-org/matrix-react-sdk/blob/8a0398b632dff1a5f6cfd4bf95d78854aeadc60e/src/stores/room-list/algorithms/tag-sorting/RecentAlgorithm.ts
 *
 */
export class ProtectedRoomActivityTracker {
  private protectedRoomActivities = new Map<
    string /*room id*/,
    number /*last event timestamp*/
  >();
  /**
   * A slot to cache the rooms for `protectedRoomsByActivity` ordered so the most recently active room is first.
   */
  private activeRoomsCache: null | string[] = null;

  /**
   * Inform the tracker that a new room is being protected by Mjolnir.
   * @param roomId The room Mjolnir is now protecting.
   */
  public addProtectedRoom(roomId: string): void {
    this.protectedRoomActivities.set(roomId, /* epoch */ 0);
    this.activeRoomsCache = null;
  }

  /**
   * Inform the trakcer that a room is no longer being protected by Mjolnir.
   * @param roomId The roomId that is no longer being protected by Mjolnir.
   */
  public removeProtectedRoom(roomId: string): void {
    this.protectedRoomActivities.delete(roomId);
    this.activeRoomsCache = null;
  }

  /**
   * Inform the tracker of a new event in a room, so that the internal ranking of rooms can be updated
   * @param roomId The room the new event is in.
   * @param event The new event.
   *
   */
  public handleEvent(roomID: StringRoomID, event: RoomEvent): void {
    const last_origin_server_ts = this.protectedRoomActivities.get(roomID);
    if (
      last_origin_server_ts !== undefined &&
      Number.isInteger(event.origin_server_ts)
    ) {
      if (event.origin_server_ts > last_origin_server_ts) {
        this.activeRoomsCache = null;
        this.protectedRoomActivities.set(roomID, event.origin_server_ts);
      }
    }
  }

  /**
   * @returns A list of protected rooms ids ordered by activity.
   */
  public protectedRoomsByActivity(): string[] {
    if (!this.activeRoomsCache) {
      this.activeRoomsCache = [...this.protectedRoomActivities]
        .sort((a, b) => b[1] - a[1])
        .map((pair) => pair[0]);
    }
    return this.activeRoomsCache;
  }
}
