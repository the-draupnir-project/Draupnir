// Copyright (C) 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";
import { StateEvent } from "../MatrixTypes/Events";
import { RoomStateRevision, StateChange } from "./StateRevisionIssuer";

/**
 * An interface for a persistent store for room state.
 * This was introduced specifically for Draupnir bot mode deployments that are
 * situated far away from the homeserver (usually servers they are not an admin for).
 * Not only is requesting room state quite latent, but also can cause their bot
 * to be hit by rate limits. The idea is that the store will help the bot start
 * quickly with less risk of being hit by rate limits.
 * Methods for initialising and closing resources do not belong on the interface,
 * the provider of the concrete depenednecy needs to call and handle those.
 */
export interface RoomStateBackingStore {
  readonly revisionListener: RoomStateBackingStore["handleRevision"];
  /**
   * A self contained version of `updateState` that can be called directly by
   * a revision issuer, with a self contained method to process in the background.
   * @param revision What is believed by the caller to be the most recent revision
   * but may not actually be, the implementor needs to check.
   */
  handleRevision(revision: RoomStateRevision, changes: StateChange[]): void;
  /**
   * Called to fetch room state from the backing store.
   * @param roomID The room we want state for.
   * @returns Either the set of current state or `undefined` if the store does
   * not have any state for this room.
   */
  getRoomState(
    roomID: StringRoomID
  ): Promise<ActionResult<StateEvent[] | undefined>>;
  /**
   * Delete any revisions about this room.
   * @param roomID The room.
   */
  forgetRoom(roomID: StringRoomID): Promise<ActionResult<void>>;
  /**
   * Delete all state from the store, from all rooms.
   */
  forgetAllRooms(): Promise<ActionResult<void>>;
}
