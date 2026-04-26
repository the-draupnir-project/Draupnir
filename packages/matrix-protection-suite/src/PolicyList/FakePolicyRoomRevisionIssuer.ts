// Copyright (C) 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { RoomStateRevisionIssuer } from "../StateTracking/StateRevisionIssuer";
import { PolicyListRevision, PolicyRoomRevision } from "./PolicyListRevision";
import {
  PolicyRoomRevisionIssuer,
  RevisionListener,
} from "./PolicyListRevisionIssuer";
import { PolicyRuleChange } from "./PolicyRuleChange";
import { RoomStatePolicyRoomRevisionIssuer } from "./RoomStatePolicyListRevisionIssuer";

export class FakePolicyRoomRevisionIssuer
  extends RoomStatePolicyRoomRevisionIssuer
  implements PolicyRoomRevisionIssuer
{
  private revisionLog: Parameters<RevisionListener>[] = [];
  public constructor(
    room: MatrixRoomID,
    currentRevision: PolicyRoomRevision,
    roomStateRevisionIssuer: RoomStateRevisionIssuer
  ) {
    super(room, currentRevision, roomStateRevisionIssuer);
  }

  public emit(
    event: "revision",
    nextRevision: PolicyListRevision,
    changes: PolicyRuleChange[],
    previousRevision: PolicyListRevision
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (event !== "revision") {
      throw new TypeError(
        `The FakePolicyRoomRevisionIssuer was only written to work with the 'revision' event and not: ${event}`
      );
    }
    this.revisionLog.push([nextRevision, changes, previousRevision]);
    return super.emit(event, nextRevision, changes, previousRevision);
  }

  // These methods are on the Fake's reflective side
  public getLastRevision(): Parameters<RevisionListener> {
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
