// Copyright (C) 2023-2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import EventEmitter from "events";
import {
  RoomStateRevision,
  RoomStateRevisionIssuer,
  StateChange,
} from "./StateRevisionIssuer";
import { StandardRoomStateRevision } from "./StandardRoomStateRevision";
import { ConstantPeriodEventBatch, EventBatch } from "./EventBatch";
import { isError } from "../Interface/Action";
import { Logger } from "../Logging/Logger";
import { RoomEvent, StateEvent } from "../MatrixTypes/Events";
import { Redaction, redactionTargetEvent } from "../MatrixTypes/Redaction";
import { calculateStateChange } from "./StateChangeType";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { RoomStateGetter } from "../Client/RoomStateGetter";
import AwaitLock from "await-lock";

const log = new Logger("StandardRoomStateRevisionIssuer");

export class StandardRoomStateRevisionIssuer
  extends EventEmitter
  implements RoomStateRevisionIssuer
{
  public currentRevision: RoomStateRevision;
  private currentBatch: ConstantPeriodEventBatch;
  private batchCompleteCallback: EventBatch["batchCompleteCallback"];
  private readonly stateRefreshLock = new AwaitLock();
  constructor(
    public readonly room: MatrixRoomID,
    private readonly roomStateGetter: RoomStateGetter,
    initialState: StateEvent[]
  ) {
    super();
    this.currentRevision = StandardRoomStateRevision.blankRevision(
      this.room
    ).reviseFromState(initialState);
    this.batchCompleteCallback = this.createBatchedRevision.bind(this);
    this.currentBatch = new ConstantPeriodEventBatch(
      this.batchCompleteCallback,
      {}
    );
  }

  private addEventToBatch(event: RoomEvent): void {
    if (this.currentBatch.isFinished()) {
      this.currentBatch = new ConstantPeriodEventBatch(
        this.batchCompleteCallback,
        {}
      );
    }
    this.currentBatch.addEvent(event);
  }
  updateForEvent(event: StateEvent): void {
    if (this.currentRevision.hasEvent(event.event_id)) {
      return;
    }
    const existingState = this.currentRevision.getStateEvent(
      event.type,
      event.state_key
    );
    if (existingState === undefined) {
      this.createRevisionFromChanges([
        {
          changeType: calculateStateChange(event, existingState),
          eventType: event.type,
          state: event,
        },
      ]);
    } else {
      // state already exists for the type+key combo
      // we need to ask the homeserver to determine how state has changed
      this.addEventToBatch(event);
    }
  }

  updateForRedaction(event: Redaction): void {
    const targetEvent = redactionTargetEvent(event);
    if (targetEvent === undefined) {
      log.warn(
        `Someone has been redacting redaction events, interesting`,
        targetEvent
      );
      return;
    }
    if (!this.currentRevision.hasEvent(targetEvent)) {
      return;
    }
    this.addEventToBatch(event);
  }

  private createRevisionFromChanges(changes: StateChange[]): void {
    const previousRevision = this.currentRevision;
    this.currentRevision = this.currentRevision.reviseFromChanges(changes);
    this.emit("revision", this.currentRevision, changes, previousRevision);
  }

  private async createBatchedRevision(): Promise<void> {
    await this.stateRefreshLock.acquireAsync();
    try {
      const currentRoomStateResult = await this.roomStateGetter.getAllState(
        this.room
      );
      if (isError(currentRoomStateResult)) {
        log.error(
          `Unable to fetch state from the room ${this.room.toPermalink()}.`,
          currentRoomStateResult.error
        );
        return;
      }
      const changes = this.currentRevision.changesFromState(
        currentRoomStateResult.ok
      );
      this.createRevisionFromChanges(changes);
    } finally {
      this.stateRefreshLock.release();
    }
  }

  public async refreshRoomState(): Promise<void> {
    await this.createBatchedRevision();
  }

  unregisterListeners(): void {
    // nothing to do.
  }
}
