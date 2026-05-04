// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { JoinedRoomsRevision } from "./JoinedRoomsRevision";
import {
  ClientRooms,
  ClientRoomsChange,
  ClientRoomsEvents,
} from "./ClientRooms";
import { RoomEvent } from "../MatrixTypes/Events";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import { Value } from "../Interface/Value";
import { JoinedRoomsSafe, StandardClientRooms } from "./StandardClientRooms";
import { ActionResult, Ok, isError } from "../Interface/Action";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

export interface ClientsInRoomMap {
  isClientInRoom(userID: StringUserID, roomID: StringRoomID): boolean;
  isClientPreemptivelyInRoom(
    userID: StringUserID,
    roomID: StringRoomID
  ): boolean;
  getManagedUsersInRoom(roomID: StringRoomID): StringUserID[];
  getClientRooms(userID: StringUserID): ClientRooms | undefined;
  makeClientRooms(
    userID: StringUserID,
    joinedRoomsThunk: JoinedRoomsSafe
  ): Promise<ActionResult<ClientRooms>>;
  removeClient(clientUserID: StringUserID): void;
  handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void;
  preemptTimelineJoin(userID: StringUserID, roomID: StringRoomID): void;
}

export class StandardClientsInRoomMap implements ClientsInRoomMap {
  private readonly userIDByRoom = new Map<StringRoomID, StringUserID[]>();
  private readonly clientRoomsByUserID = new Map<StringUserID, ClientRooms>();

  private readonly userRevisionListener: ClientRoomsEvents["revision"];

  constructor() {
    this.userRevisionListener = this.userRevisionListenerMethod.bind(this);
  }

  private addUserToRoom(roomID: StringRoomID, userID: StringUserID) {
    const entry = this.userIDByRoom.get(roomID);
    if (entry === undefined) {
      this.userIDByRoom.set(roomID, [userID]);
    } else {
      entry.push(userID);
    }
  }

  private removeUserFromRoom(roomID: StringRoomID, userID: StringUserID): void {
    const entry = this.userIDByRoom.get(roomID);
    if (entry == undefined) {
      return;
    }
    const nextEntry = entry.filter((user) => user !== userID);
    if (nextEntry.length === 0) {
      this.userIDByRoom.delete(roomID);
    } else {
      this.userIDByRoom.set(roomID, nextEntry);
    }
  }

  private userRevisionListenerMethod(
    revision: JoinedRoomsRevision,
    changes: ClientRoomsChange
  ): void {
    for (const joinRoomID of changes.joined) {
      this.addUserToRoom(joinRoomID, revision.clientUserID);
    }
    for (const preemptivelyJoinedRoomID of changes.preemptivelyJoined) {
      this.addUserToRoom(preemptivelyJoinedRoomID, revision.clientUserID);
    }
    for (const partRoomID of changes.parted) {
      this.removeUserFromRoom(partRoomID, revision.clientUserID);
    }
    for (const partRoomID of changes.failedPreemptiveJoins) {
      this.removeUserFromRoom(partRoomID, revision.clientUserID);
    }
  }
  private addClientRooms(client: ClientRooms): void {
    for (const roomID of client.currentRevision.allJoinedRooms) {
      this.addUserToRoom(roomID, client.clientUserID);
    }
    for (const roomID of client.allPreemptedRooms) {
      this.addUserToRoom(roomID, client.clientUserID);
    }
    this.clientRoomsByUserID.set(client.clientUserID, client);
    client.on("revision", this.userRevisionListener);
  }
  public async makeClientRooms(
    userID: StringUserID,
    joinedRoomsThunk: JoinedRoomsSafe
  ): Promise<ActionResult<ClientRooms>> {
    // if for whatever reason a client needs this class to use a different
    // implemetnation of ClientRooms, then we should add a dedicated factory
    // as an argument to this class.
    const existingClientRooms = this.getClientRooms(userID);
    if (existingClientRooms !== undefined) {
      return Ok(existingClientRooms);
    }
    const clientRooms = await StandardClientRooms.makeClientRooms(
      userID,
      joinedRoomsThunk
    );
    if (isError(clientRooms)) {
      return clientRooms;
    } else {
      this.addClientRooms(clientRooms.ok);
      return clientRooms;
    }
  }

  private removeClientRooms(client: ClientRooms): void {
    for (const roomID of client.currentRevision.allJoinedRooms) {
      this.removeUserFromRoom(roomID, client.clientUserID);
    }
    for (const roomID of client.allPreemptedRooms) {
      this.removeUserFromRoom(roomID, client.clientUserID);
    }
    this.clientRoomsByUserID.delete(client.clientUserID);
    client.off("revision", this.userRevisionListener);
  }

  public removeClient(clientUserID: StringUserID): void {
    const clientRooms = this.getClientRooms(clientUserID);
    if (clientRooms === undefined) {
      return;
    }
    this.removeClientRooms(clientRooms);
  }

  public isClientInRoom(userID: StringUserID, roomID: StringRoomID): boolean {
    const entry = this.clientRoomsByUserID.get(userID);
    if (entry === undefined) {
      return false;
    } else {
      return entry.isJoinedRoom(roomID);
    }
  }

  public isClientPreemptivelyInRoom(
    userID: StringUserID,
    roomID: StringRoomID
  ): boolean {
    const entry = this.clientRoomsByUserID.get(userID);
    if (entry === undefined) {
      return false;
    } else {
      return entry.isPreemptivelyJoinedRoom(roomID);
    }
  }

  public preemptTimelineJoin(userID: StringUserID, roomID: StringRoomID): void {
    const entry = this.getClientRooms(userID);
    if (entry === undefined) {
      throw new TypeError(
        `Unable to preempt a join for an unknown client ${userID}`
      );
    }
    entry.preemptTimelineJoin(roomID);
  }

  public getClientRooms(userID: StringUserID): ClientRooms | undefined {
    return this.clientRoomsByUserID.get(userID);
  }

  public getManagedUsersInRoom(roomID: StringRoomID): StringUserID[] {
    return this.userIDByRoom.get(roomID) ?? [];
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    const usersInRoom = this.getManagedUsersInRoom(roomID);
    for (const user of usersInRoom) {
      const clientRooms = this.getClientRooms(user);
      clientRooms?.handleTimelineEvent(roomID, event);
    }
    if (event.type === "m.room.member" && Value.Check(MembershipEvent, event)) {
      // only inform if we already informed the client about this event.
      if (!usersInRoom.includes(event.state_key)) {
        const clientRooms = this.getClientRooms(event.state_key);
        clientRooms?.handleTimelineEvent(roomID, event);
      }
    }
  }
}
