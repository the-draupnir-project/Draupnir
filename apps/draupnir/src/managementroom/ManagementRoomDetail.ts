// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  JoinRulesEvent,
  Membership,
  RoomMembershipRevisionIssuer,
  RoomStateRevisionIssuer,
} from "matrix-protection-suite";

export interface ManagementRoomDetail {
  isRoomPublic(): boolean;
  isModerator(userID: StringUserID): boolean;
  managementRoom: MatrixRoomID;
  managementRoomID: StringRoomID;
}

export class StandardManagementRoomDetail implements ManagementRoomDetail {
  public constructor(
    public readonly managementRoom: MatrixRoomID,
    private readonly membershipIssuer: RoomMembershipRevisionIssuer,
    private readonly stateIssuer: RoomStateRevisionIssuer
  ) {
    // nothing to do mare.
  }

  public isRoomPublic(): boolean {
    const joinRuleEvent =
      this.stateIssuer.currentRevision.getStateEvent<JoinRulesEvent>(
        "m.room.join_rules",
        ""
      );
    if (joinRuleEvent === undefined) {
      return false; // auth rules are fail safe.
    }
    return joinRuleEvent.content.join_rule === "public";
  }

  public isModerator(userID: StringUserID): boolean {
    return (
      this.membershipIssuer.currentRevision.membershipForUser(userID)
        ?.membership === Membership.Join
    );
  }

  public get managementRoomID(): StringRoomID {
    return this.managementRoom.toRoomIDOrAlias();
  }
}
