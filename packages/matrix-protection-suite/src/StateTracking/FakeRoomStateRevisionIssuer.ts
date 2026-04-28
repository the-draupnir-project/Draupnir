// Copyright (C) 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import EventEmitter from "events";
import {
  RoomStateRevision,
  RoomStateRevisionIssuer,
  StateChange,
} from "./StateRevisionIssuer";
import { StateEvent } from "../MatrixTypes/Events";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";

export class FakeRoomStateRevisionIssuer
  extends EventEmitter
  implements RoomStateRevisionIssuer
{
  public constructor(
    public currentRevision: RoomStateRevision,
    public readonly room: MatrixRoomID
  ) {
    super();
  }

  updateForEvent(event: StateEvent): void {
    const state = this.currentRevision.allState.filter(
      (existingEvent) =>
        existingEvent.state_key !== event.state_key &&
        event.type !== existingEvent.type
    );
    this.reviseFromState([...state, event]);
  }

  updateForRedaction(): void {
    // nothing to do.
  }

  unregisterListeners(): void {
    // nothing to unregister
  }

  // this is a method specifically for the fake side of the implementation.
  // ideally, we'd have some way to define the different side as a mixin.
  // and then only allow access to that side through a mirror for that side.
  reviseRevision(changes: StateChange[]): void {
    const previousRevision = this.currentRevision;
    this.currentRevision = this.currentRevision.reviseFromChanges(changes);
    this.emit("revision", this.currentRevision, changes, previousRevision);
  }

  // this method is also on the Fake side.
  reviseFromState(state: StateEvent[]): void {
    const changes = this.currentRevision.changesFromState(state);
    this.reviseRevision(changes);
  }

  // also on the Fake side.
  appendState(state: StateEvent[]): void {
    this.reviseFromState([...this.currentRevision.allState, ...state]);
  }
}
