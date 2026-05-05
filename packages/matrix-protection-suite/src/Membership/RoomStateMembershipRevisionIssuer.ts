// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import EventEmitter from "events";
import { RoomMembershipRevisionIssuer } from "./MembershipRevisionIssuer";
import { RoomMembershipRevision } from "./MembershipRevision";
import {
  RoomStateRevision,
  RoomStateRevisionIssuer,
  StateChange,
  StateRevisionListener,
} from "../StateTracking/StateRevisionIssuer";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import { Redaction } from "../MatrixTypes/Redaction";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";

/**
 * An implementation of the {@link RoomMembershipRevisionIssuer} that
 * uses the {@link RoomStateRevisionIssuer}.
 */
export class RoomStateMembershipRevisionIssuer
  extends EventEmitter
  implements RoomMembershipRevisionIssuer
{
  private readonly stateRevisionListener: StateRevisionListener<RoomStateRevision>;
  constructor(
    public readonly room: MatrixRoomID,
    public currentRevision: RoomMembershipRevision,
    private readonly roomStateRevisionIssuer: RoomStateRevisionIssuer
  ) {
    super();
    this.stateRevisionListener = this.listener.bind(this);
    this.roomStateRevisionIssuer.on("revision", this.stateRevisionListener);
  }

  updateForMembershipEvent(event: MembershipEvent): void {
    if (this.currentRevision.hasEvent(event.event_id)) {
      return;
    }
    this.roomStateRevisionIssuer.updateForEvent(event);
  }

  updateForRedactionEvent(event: Redaction): void {
    this.roomStateRevisionIssuer.updateForRedaction(event);
  }

  private listener(
    _stateRevision: RoomStateRevision,
    stateChanges: StateChange[]
  ) {
    const membershipEvents = stateChanges
      .filter((change) => change.eventType === "m.room.member")
      .map((change) => change.state) as MembershipEvent[];
    const membershipChanges =
      this.currentRevision.changesFromMembership(membershipEvents);
    const previousRevision = this.currentRevision;
    this.currentRevision =
      previousRevision.reviseFromChanges(membershipChanges);
    this.emit(
      "revision",
      this.currentRevision,
      membershipChanges,
      previousRevision
    );
  }

  public unregisterListeners(): void {
    this.roomStateRevisionIssuer.off("revision", this.stateRevisionListener);
  }
}
