// Copyright (C) 2023-2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import { Redaction } from "../MatrixTypes/Redaction";
import { MembershipChange } from "./MembershipChange";
import {
  MembershipRevision,
  RoomMembershipRevision,
} from "./MembershipRevision";

export type MembershipRevisionListener<
  Revision extends MembershipRevision = MembershipRevision,
> = (
  nextRevision: Revision,
  changes: MembershipChange[],
  previousRevision: Revision
) => void;

export declare interface MembershipRevisionIssuer {
  currentRevision: MembershipRevision;
  on(event: "revision", listener: MembershipRevisionListener): this;
  off(...args: Parameters<MembershipRevisionIssuer["on"]>): this;
  emit(
    event: "revision",
    ...args: Parameters<MembershipRevisionListener>
  ): boolean;
  unregisterListeners(): void;
}

export declare interface RoomMembershipRevisionIssuer extends MembershipRevisionIssuer {
  currentRevision: RoomMembershipRevision;
  room: MatrixRoomID;
  /**
   * Inform the revision issuer about a membership event in the room's timeline.
   * @param event The membership event.
   */
  updateForMembershipEvent(event: MembershipEvent): void;
  /**
   * Inform the revision issuer about a redaction event in the room's timeline.
   * @param event The redaction in question.
   */
  updateForRedactionEvent(event: Redaction): void;
  on(
    event: "revision",
    listener: MembershipRevisionListener<RoomMembershipRevision>
  ): this;
  off(...args: Parameters<RoomMembershipRevisionIssuer["on"]>): this;
  emit(
    event: "revision",
    ...args: Parameters<MembershipRevisionListener<RoomMembershipRevision>>
  ): boolean;
}
