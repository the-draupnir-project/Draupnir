// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import EventEmitter from "events";
import {
  SetRoomState,
  SetRoomStateMirror,
  SetRoomStateMirrorCord,
} from "./SetRoomState";
import {
  RoomStateManager,
  RoomStateRevision,
  RoomStateRevisionIssuer,
  StateRevisionListener,
} from "./StateRevisionIssuer";
import { ActionResult, Ok, isError } from "../Interface/Action";
import {
  StringRoomID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";

/**
 * Provides immediate (synchronous) access to the room state within a set of rooms.
 * Needs to be backed up with the ProtectedRoomManager which will add and remove rooms
 * via the `SetRoomStateMirror` as they are added and removed from the protected
 * rooms set.
 */
export class StandardSetRoomState extends EventEmitter implements SetRoomState {
  private readonly issuers = new Map<StringRoomID, RoomStateRevisionIssuer>();

  private readonly revisionListener: StateRevisionListener<RoomStateRevision>;

  private constructor() {
    super();
    this.revisionListener = this.stateRevision.bind(this);
  }
  getRevision(room: StringRoomID): RoomStateRevision | undefined {
    return this.issuers.get(room)?.currentRevision;
  }

  public static async create(
    roomStateManager: RoomStateManager,
    roomSet: MatrixRoomID[]
  ): Promise<ActionResult<SetRoomState>> {
    const setRoomState = new StandardSetRoomState();
    const issuersResult = await Promise.all(
      roomSet.map((room) => roomStateManager.getRoomStateRevisionIssuer(room))
    );
    for (const result of issuersResult) {
      if (isError(result)) {
        return result.elaborate(
          `Unable to fetch a room state revision issuer while creating the SetRoomState`
        );
      } else {
        SetRoomStateMirror.addRoom(setRoomState, result.ok.room, result.ok);
      }
    }
    return Ok(setRoomState);
  }

  public static blankSet(): StandardSetRoomState {
    return new StandardSetRoomState();
  }

  public [SetRoomStateMirrorCord.addRoom](
    room: MatrixRoomID,
    roomStateRevisionIssuer: RoomStateRevisionIssuer
  ): void {
    if (this.issuers.has(room.toRoomIDOrAlias())) {
      return;
    }
    this.issuers.set(room.toRoomIDOrAlias(), roomStateRevisionIssuer);
    roomStateRevisionIssuer.on("revision", this.revisionListener);
  }
  public [SetRoomStateMirrorCord.removeRoom](room: MatrixRoomID): void {
    const issuer = this.issuers.get(room.toRoomIDOrAlias());
    if (issuer === undefined) {
      return;
    }
    this.issuers.delete(room.toRoomIDOrAlias());
    issuer.off("revision", this.revisionListener);
  }
  public unregisterListeners(): void {
    for (const issuer of this.issuers.values()) {
      issuer.off("revision", this.revisionListener);
    }
  }
  public get allRooms(): RoomStateRevision[] {
    return [...this.issuers.values()].map((issuer) => issuer.currentRevision);
  }

  private stateRevision(
    ...[nextRevision, changes, previousRevision]: Parameters<
      StateRevisionListener<RoomStateRevision>
    >
  ) {
    this.emit(
      "revision",
      nextRevision.room.toRoomIDOrAlias(),
      nextRevision,
      changes,
      previousRevision
    );
  }
}
