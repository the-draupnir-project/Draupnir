// Copyright (C) 2023-2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// TODO
// - IMPORTANT
//   because we are always lagging behind for up to date state deltas ie
//   1. https://github.com/matrix-org/matrix-spec/issues/262
//   2. https://github.com/matrix-org/matrix-spec/issues/1209
//   We have to make a distinction for member joins etc between
//   timeline events and state changes so that we can still give
//   consumers chance to react in an attack.

import {
  StringEventID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";
import { StateEvent } from "../MatrixTypes/Events";
import { Redaction } from "../MatrixTypes/Redaction";
import { StateChangeType } from "./StateChangeType";
import { Revision } from "../PolicyList/Revision";

export interface StateRevision {
  readonly allState: StateEvent[];
  readonly revisionID: Revision;
  getStateEvent<T extends StateEvent>(type: string, key: string): T | undefined;
  getStateEventsOfType<T extends StateEvent>(type: string): T[];
  getStateEventsOfTypes<T extends StateEvent>(types: string[]): T[];
  hasEvent(eventID: StringEventID): boolean;
  reviseFromChanges(changes: StateChange[]): StateRevision;
}

export interface RoomStateRevision extends StateRevision {
  room: MatrixRoomID;
  changesFromState(state: StateEvent[]): StateChange[];
  reviseFromState(state: StateEvent[]): RoomStateRevision;
  reviseFromChanges(changes: StateChange[]): RoomStateRevision;
}

export interface StateChange<EventSchema extends StateEvent = StateEvent> {
  readonly changeType: StateChangeType;
  readonly eventType: EventSchema["type"];
  readonly state: EventSchema;
  /**
   * The previous state that has been changed. Only (and always) provided when there was a state type-key
   * combination for this event previously.
   * This will be a copy of the same event as `event` when a redaction has occurred and this will show its unredacted state.
   */
  readonly previousState?: EventSchema;
}

export type StateRevisionListener<
  Revision extends StateRevision = StateRevision,
> = (
  nextRevision: Revision,
  changes: StateChange[],
  previousRevision: Revision
) => void;

export declare interface StateRevisionIssuer {
  readonly currentRevision: StateRevision;
  on(event: "revision", listener: StateRevisionListener): this;
  off(...args: Parameters<StateRevisionIssuer["on"]>): this;
  emit(event: "revision", ...args: Parameters<StateRevisionListener>): boolean;
  unregisterListeners(): void;
}

export declare interface RoomStateRevisionIssuer extends StateRevisionIssuer {
  readonly currentRevision: RoomStateRevision;
  readonly room: MatrixRoomID;
  /**
   * Inform the revision issuer about a state event in the room's timeline.
   * @param event The state event.
   */
  updateForEvent(event: StateEvent): void;
  /**
   * Inform the revision issuer about a redaction event in the room's timeline.
   * @param event The redaction in question.
   */
  updateForRedaction(event: Redaction): void;
  on(
    event: "revision",
    listener: StateRevisionListener<RoomStateRevision>
  ): this;
  off(...args: Parameters<RoomStateRevisionIssuer["on"]>): this;
  emit(
    event: "revision",
    ...args: Parameters<StateRevisionListener<RoomStateRevision>>
  ): boolean;
}

export interface RoomStateManager {
  getRoomStateRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomStateRevisionIssuer>>;
}

/**
 *    * Handle a timeline event from a client.
 * Currently there are no reliable ways of informing clients about changes to room state
 * so we have to refresh our cache every time we see a state event in the timeline.
 * 1. https://github.com/matrix-org/matrix-spec/issues/262
 * 2. https://github.com/matrix-org/matrix-spec/issues/1209
 */
