// Copyright (C) 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  StringRoomID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { MembershipChange } from "./MembershipChange";
import { RoomMembershipRevision } from "./MembershipRevision";
import { RoomMembershipRevisionIssuer } from "./MembershipRevisionIssuer";

export type SetRoomMembershipListener = (
  roomID: StringRoomID,
  nextRevision: RoomMembershipRevision,
  changes: MembershipChange[],
  previousRevision: RoomMembershipRevision
) => void;

export type SetRoomMembershipChangeListener = (
  roomID: StringRoomID,
  direction: "add" | "remove",
  revision: RoomMembershipRevision
) => void;

export const SetRoomMembershipMirrorCord = Object.freeze({
  addRoom: Symbol("addRoom"),
  removeRoom: Symbol("removeRoom"),
}) as Readonly<{
  readonly addRoom: unique symbol;
  readonly removeRoom: unique symbol;
}>;

export declare interface SetRoomMembership {
  [SetRoomMembershipMirrorCord.addRoom](
    room: MatrixRoomID,
    issuer: RoomMembershipRevisionIssuer
  ): void;
  [SetRoomMembershipMirrorCord.removeRoom](room: MatrixRoomID): void;
  on(event: "membership", listener: SetRoomMembershipListener): this;
  off(event: "membership", listener: SetRoomMembershipListener): this;
  emit(
    event: "membership",
    ...args: Parameters<SetRoomMembershipListener>
  ): boolean;
  on(event: "SetChange", listener: SetRoomMembershipChangeListener): this;
  off(event: "SetChange", listener: SetRoomMembershipChangeListener): this;
  emit(
    event: "SetChange",
    ...args: Parameters<SetRoomMembershipChangeListener>
  ): boolean;
  unregisterListeners(): void;
  allRooms: RoomMembershipRevision[];
  getRevision(room: StringRoomID): RoomMembershipRevision | undefined;
}

export const SetRoomMembershipMirror = Object.freeze({
  addRoom(
    setMembership: SetRoomMembership,
    room: MatrixRoomID,
    revisionIssuer: RoomMembershipRevisionIssuer
  ): void {
    setMembership[SetRoomMembershipMirrorCord.addRoom](room, revisionIssuer);
  },
  removeRoom(setMembership: SetRoomMembership, room: MatrixRoomID): void {
    setMembership[SetRoomMembershipMirrorCord.removeRoom](room);
  },
});
