// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import EventEmitter from "events";
import {
  SetMembershipRevision,
  SetMembershipDelta,
  StandardSetMembershipRevision,
} from "./SetMembershipRevision";
import {
  SetRoomMembership,
  SetRoomMembershipChangeListener,
  SetRoomMembershipListener,
} from "./SetRoomMembership";
import { RoomMembershipRevision } from "./MembershipRevision";
import { MembershipChange } from "./MembershipChange";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { Logger } from "../Logging/Logger";

export type SetMembershipRevisionListener = (
  nextRevision: SetMembershipRevision,
  changes: SetMembershipDelta,
  previousRevision: SetMembershipRevision
) => void;

export interface SetMembershipRevisionIssuer {
  readonly currentRevision: SetMembershipRevision;
  on(event: "revision", listener: SetMembershipRevisionListener): this;
  off(event: "revision", listener: SetMembershipRevisionListener): this;
  emit(
    event: "revision",
    ...args: Parameters<SetMembershipRevisionListener>
  ): boolean;
  unregisterListeners(): void;
}

const log = new Logger("StandardSetMembershipRevisionListener");
export class StandardSetMembershipRevisionIssuer
  extends EventEmitter
  implements SetMembershipRevisionIssuer
{
  currentRevision: SetMembershipRevision;
  private readonly roomMembershipRevisionListener: SetRoomMembershipListener;
  private readonly setRoomChangeListener: SetRoomMembershipChangeListener;
  constructor(private readonly setRoomMembershipIssuer: SetRoomMembership) {
    super();
    log.debug(
      "Creating a set membership revision issuer, this can take some time."
    );
    this.currentRevision = setRoomMembershipIssuer.allRooms.reduce(
      (revision, roomMembershipRevision) => {
        return revision.reviseFromChanges(
          revision.changesFromAddedRoom(roomMembershipRevision)
        );
      },
      StandardSetMembershipRevision.blankRevision()
    );
    log.debug("Finished creating a set membership revision issuer.");
    this.roomMembershipRevisionListener = this.membershipRevision.bind(this);
    setRoomMembershipIssuer.on(
      "membership",
      this.roomMembershipRevisionListener
    );
    this.setRoomChangeListener = this.setRoomChange.bind(this);
    setRoomMembershipIssuer.on("SetChange", this.setRoomChangeListener);
  }

  public unregisterListeners(): void {
    this.setRoomMembershipIssuer.off(
      "membership",
      this.roomMembershipRevisionListener
    );
    this.setRoomMembershipIssuer.off("SetChange", this.setRoomChangeListener);
  }

  private membershipRevision(
    roomID: StringRoomID,
    _nextMembershipRevision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): void {
    const previousRevision = this.currentRevision;
    const delta = previousRevision.changesFromMembershipChanges(changes);
    this.currentRevision = this.currentRevision.reviseFromChanges(delta);
    this.emit("revision", this.currentRevision, delta, previousRevision);
  }

  private setRoomChange(
    roomID: StringRoomID,
    direction: "add" | "remove",
    revision: RoomMembershipRevision
  ): void {
    const previousRevision = this.currentRevision;
    const delta =
      direction === "add"
        ? previousRevision.changesFromAddedRoom(revision)
        : previousRevision.changesFromRemovedRoom(revision);
    this.currentRevision = previousRevision.reviseFromChanges(delta);
    this.emit("revision", this.currentRevision, delta, previousRevision);
  }
}
