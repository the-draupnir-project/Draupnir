// Copyright (C) 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MembershipChange } from "./MembershipChange";
import { RoomMembershipRevision } from "./MembershipRevision";
import {
  MembershipRevisionListener,
  RoomMembershipRevisionIssuer,
} from "./MembershipRevisionIssuer";
import { RoomStateMembershipRevisionIssuer } from "./RoomStateMembershipRevisionIssuer";
import { RoomStateRevisionIssuer } from "../StateTracking/StateRevisionIssuer";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";

export class FakeRoomMembershipRevisionIssuer
  extends RoomStateMembershipRevisionIssuer
  implements RoomMembershipRevisionIssuer
{
  private revisionLog: Parameters<
    MembershipRevisionListener<RoomMembershipRevision>
  >[] = [];
  public constructor(
    room: MatrixRoomID,
    currentRevision: RoomMembershipRevision,
    roomStateRevisionIssuer: RoomStateRevisionIssuer
  ) {
    super(room, currentRevision, roomStateRevisionIssuer);
  }

  public emit(
    event: "revision",
    nextRevision: RoomMembershipRevision,
    changes: MembershipChange[],
    previousRevision: RoomMembershipRevision
  ): boolean {
    // I can see why this rule exists but it's not appropriate here, as we don't
    // really know the context that this fake might gets used in (maybe js?).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (event !== "revision") {
      throw new TypeError(
        `FakeRoomMembershipRevisionIssuer was only written for the revision event`
      );
    }
    this.revisionLog.push([nextRevision, changes, previousRevision]);
    return super.emit(event, nextRevision, changes, previousRevision);
  }

  // These methods are on the Fake's reflective side
  public getLastRevision(): Parameters<
    MembershipRevisionListener<RoomMembershipRevision>
  > {
    const revisionEntry = this.revisionLog.at(-1);
    if (revisionEntry === undefined) {
      throw new TypeError(`the revision log is empty`);
    }
    return revisionEntry;
  }

  public getNumberOfRevisions(): number {
    return this.revisionLog.length;
  }
}
