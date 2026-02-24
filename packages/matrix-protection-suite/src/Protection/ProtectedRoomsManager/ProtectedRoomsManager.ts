// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../../Interface/Action";
import { SetRoomMembership } from "../../Membership/SetRoomMembership";
import { SetRoomState } from "../../StateTracking/SetRoomState";
import { SetMembershipRevisionIssuer } from "../../Membership/SetMembershipRevisionIssuer";

export enum ProtectedRoomChangeType {
  Added = "added",
  Removed = "removed",
}

export type ProtectedRoomsChangeListener = (
  room: MatrixRoomID,
  changeType: ProtectedRoomChangeType
) => void;

export interface ProtectedRoomsManager {
  readonly allProtectedRooms: MatrixRoomID[];
  readonly setRoomMembership: SetRoomMembership;
  readonly setRoomState: SetRoomState;
  readonly setMembership: SetMembershipRevisionIssuer;
  isProtectedRoom(roomID: StringRoomID): boolean;
  getProtectedRoom(roomID: StringRoomID): MatrixRoomID | undefined;
  addRoom(room: MatrixRoomID): Promise<ActionResult<void>>;
  removeRoom(room: MatrixRoomID): Promise<ActionResult<void>>;
  on(event: "change", listener: ProtectedRoomsChangeListener): this;
  off(event: "change", listener: ProtectedRoomsChangeListener): this;
  emit(
    event: "change",
    ...args: Parameters<ProtectedRoomsChangeListener>
  ): void;
  unregisterListeners(): void;
}
