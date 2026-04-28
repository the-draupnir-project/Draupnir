// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "events";
import { ActionResult, Ok, isError } from "../../Interface/Action";
import { RoomMembershipManager } from "../../Membership/RoomMembershipManager";
import {
  SetRoomMembership,
  SetRoomMembershipMirror,
} from "../../Membership/SetRoomMembership";
import {
  SetRoomState,
  SetRoomStateMirror,
} from "../../StateTracking/SetRoomState";
import {
  RoomStateManager,
  RoomStateRevisionIssuer,
} from "../../StateTracking/StateRevisionIssuer";
import { ProtectedRoomsConfig } from "../ProtectedRoomsConfig/ProtectedRoomsConfig";
import {
  ProtectedRoomChangeType,
  ProtectedRoomsManager,
} from "./ProtectedRoomsManager";
import { RoomJoiner } from "../../Client/RoomJoiner";
import { RoomMembershipRevisionIssuer } from "../../Membership/MembershipRevisionIssuer";
import {
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  SetMembershipRevisionIssuer,
  StandardSetMembershipRevisionIssuer,
} from "../../Membership/SetMembershipRevisionIssuer";

function makeJoinAndAdd(
  roomJoiner: RoomJoiner,
  roomStateManager: RoomStateManager,
  roomMembershipManager: RoomMembershipManager,
  addCB: (
    room: MatrixRoomID,
    stateIssuer: RoomStateRevisionIssuer,
    membershipIssuer: RoomMembershipRevisionIssuer
  ) => void
): (room: MatrixRoomID) => Promise<ActionResult<void>> {
  return async function joinAndAdd(
    room: MatrixRoomID
  ): Promise<ActionResult<void>> {
    const joinResult = await roomJoiner.joinRoom(room);
    if (isError(joinResult)) {
      return joinResult;
    }
    const stateIssuer = await roomStateManager.getRoomStateRevisionIssuer(room);
    if (isError(stateIssuer)) {
      return stateIssuer;
    }
    const membershipIssuer =
      await roomMembershipManager.getRoomMembershipRevisionIssuer(room);
    if (isError(membershipIssuer)) {
      return membershipIssuer;
    }
    addCB(room, stateIssuer.ok, membershipIssuer.ok);
    return Ok(undefined);
  };
}

export class StandardProtectedRoomsManager
  extends EventEmitter
  implements ProtectedRoomsManager
{
  private readonly protectedRooms = new Map<StringRoomID, MatrixRoomID>();
  public readonly setMembership: SetMembershipRevisionIssuer;
  private constructor(
    private readonly protectedRoomsConfig: ProtectedRoomsConfig,
    public setRoomMembership: SetRoomMembership,
    public setRoomState: SetRoomState,
    private readonly roomStateManager: RoomStateManager,
    private readonly roomMembershipManager: RoomMembershipManager,
    private readonly roomJoiner: RoomJoiner
  ) {
    super();
    for (const room of protectedRoomsConfig.getProtectedRooms()) {
      this.protectedRooms.set(room.toRoomIDOrAlias(), room);
    }
    this.setMembership = new StandardSetMembershipRevisionIssuer(
      setRoomMembership
    );
  }

  /**
   * Creates a StandaardProtectedRoomsManager from blank setMembership/State
   * objects. Will initialise the setMembership/State to contain the correct
   * state for the entire protected rooms set.
   */
  public static async create(
    protectedRoomsConfig: ProtectedRoomsConfig,
    roomStateManager: RoomStateManager,
    roomMembershipManager: RoomMembershipManager,
    roomJoiner: RoomJoiner,
    blankSetMembership: SetRoomMembership,
    blankSetRoomState: SetRoomState
  ): Promise<ActionResult<ProtectedRoomsManager>> {
    const joinAndAdd = makeJoinAndAdd(
      roomJoiner,
      roomStateManager,
      roomMembershipManager,
      function (room, stateIssuer, membershipIssuer) {
        SetRoomStateMirror.addRoom(blankSetRoomState, room, stateIssuer);
        SetRoomMembershipMirror.addRoom(
          blankSetMembership,
          room,
          membershipIssuer
        );
      }
    );
    for (const room of protectedRoomsConfig.getProtectedRooms()) {
      const result = await joinAndAdd(room);
      if (isError(result)) {
        return await protectedRoomsConfig.reportUseError(
          `Unable to join and add configured protected room ${room.toPermalink()}`,
          room,
          result.error
        );
      }
    }
    return Ok(
      new StandardProtectedRoomsManager(
        protectedRoomsConfig,
        blankSetMembership,
        blankSetRoomState,
        roomStateManager,
        roomMembershipManager,
        roomJoiner
      )
    );
  }

  public get allProtectedRooms() {
    return [...this.protectedRooms.values()];
  }
  isProtectedRoom(roomID: StringRoomID): boolean {
    return this.protectedRooms.has(roomID);
  }
  getProtectedRoom(roomID: StringRoomID): MatrixRoomID | undefined {
    return this.protectedRooms.get(roomID);
  }
  public async addRoom(room: MatrixRoomID): Promise<ActionResult<void>> {
    const joinResult = await this.roomJoiner.joinRoom(room);
    if (isError(joinResult)) {
      return joinResult;
    }
    if (this.isProtectedRoom(room.toRoomIDOrAlias())) {
      return Ok(undefined);
    }
    const stateIssuer =
      await this.roomStateManager.getRoomStateRevisionIssuer(room);
    if (isError(stateIssuer)) {
      return stateIssuer;
    }
    const membershipIssuer =
      await this.roomMembershipManager.getRoomMembershipRevisionIssuer(room);
    if (isError(membershipIssuer)) {
      return membershipIssuer;
    }
    const storeResult = await this.protectedRoomsConfig.addRoom(room);
    if (isError(storeResult)) {
      return storeResult;
    }
    // we must mark the room as protected first, so that the emitters for the set changes
    // will know the room is now protected and be able to act accordingly.
    this.protectedRooms.set(room.toRoomIDOrAlias(), room);
    // I don't like that these emitters will work while there's still inconsistent state
    // in the other set. The emit should be placed on the mirrors and called here too!
    // Then the sets should be moved to the ProtectedRoomsManager subfolder.
    // I also don't know whether it will matter when the state emitter is called
    // before the membership emitter.
    SetRoomStateMirror.addRoom(this.setRoomState, room, stateIssuer.ok);
    SetRoomMembershipMirror.addRoom(
      this.setRoomMembership,
      room,
      membershipIssuer.ok
    );
    this.emit("change", room, ProtectedRoomChangeType.Added);
    return Ok(undefined);
  }
  public async removeRoom(room: MatrixRoomID): Promise<ActionResult<void>> {
    const storeResult = await this.protectedRoomsConfig.removeRoom(room);
    if (isError(storeResult)) {
      return storeResult;
    }
    if (this.isProtectedRoom(room.toRoomIDOrAlias())) {
      SetRoomStateMirror.removeRoom(this.setRoomState, room);
      SetRoomMembershipMirror.removeRoom(this.setRoomMembership, room);
      this.protectedRooms.delete(room.toRoomIDOrAlias());
      this.emit("change", room, ProtectedRoomChangeType.Removed);
    }
    return Ok(undefined);
  }

  public unregisterListeners(): void {
    // doesn't seem to be anything we need to do.
  }
}
