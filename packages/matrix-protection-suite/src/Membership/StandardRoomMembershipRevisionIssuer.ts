// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import EventEmitter from "events";
import { RoomMembershipRevisionIssuer } from "./MembershipRevisionIssuer";
import { RoomMembershipRevision } from "./MembershipRevision";
import { RoomMembershipManager } from "./RoomMembershipManager";
import { Logger } from "../Logging/Logger";
import { isError } from "../Interface/Action";
import {
  ConstantPeriodEventBatch,
  EventBatch,
} from "../StateTracking/EventBatch";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import { RoomEvent } from "../MatrixTypes/Events";
import { Redaction } from "../MatrixTypes/Redaction";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";

const log = new Logger("StandardRoomMembershipRevisionIssuer");

/**
 * Users of this class are strongly recommended to consider the
 * RoomState based alternative `RoomStateMembershipRevisionIssuer`.
 * This class will likely be removed shortly.
 */
export class StandardRoomMembershipRevisionIssuer
  extends EventEmitter
  implements RoomMembershipRevisionIssuer
{
  private currentBatch: ConstantPeriodEventBatch;
  private batchCompleteCallback: EventBatch["batchCompleteCallback"];
  constructor(
    public readonly room: MatrixRoomID,
    public currentRevision: RoomMembershipRevision,
    private readonly roomMembershipManager: RoomMembershipManager
  ) {
    super();
    this.batchCompleteCallback = this.createBatchedRevision.bind(this);
    this.currentBatch = new ConstantPeriodEventBatch(
      this.batchCompleteCallback,
      {}
    );
  }

  private addToBatch(event: RoomEvent): void {
    if (this.currentBatch.isFinished()) {
      this.currentBatch = new ConstantPeriodEventBatch(
        this.batchCompleteCallback,
        {}
      );
    }
    this.currentBatch.addEvent(event);
  }

  updateForMembershipEvent(event: MembershipEvent): void {
    if (this.currentRevision.hasEvent(event.event_id)) {
      return;
    }
    this.addToBatch(event);
  }

  updateForRedactionEvent(event: Redaction): void {
    this.addToBatch(event);
  }

  private async createBatchedRevision(): Promise<void> {
    const currentRoomMembershipResult =
      await this.roomMembershipManager.getRoomMembershipEvents(this.room);
    if (isError(currentRoomMembershipResult)) {
      log.error(
        `Unable to fetch members from the room ${this.room.toPermalink()}.`,
        currentRoomMembershipResult.error
      );
      return;
    }
    const previousRevision = this.currentRevision;
    const changes = this.currentRevision.changesFromMembership(
      currentRoomMembershipResult.ok
    );
    this.currentRevision = this.currentRevision.reviseFromChanges(changes);
    this.emit("revision", this.currentRevision, changes, previousRevision);
  }

  public unregisterListeners(): void {
    // nothing to do.
  }
}
