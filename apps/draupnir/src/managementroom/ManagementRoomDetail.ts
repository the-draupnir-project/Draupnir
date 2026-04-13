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
  PowerLevelPermission,
  PowerLevelsEvent,
  PowerLevelsMirror,
  RoomCreateEvent,
  RoomMembershipRevisionIssuer,
  RoomStateRevisionIssuer,
} from "matrix-protection-suite";

export interface ManagementRoomDetail {
  isRoomPublic(): boolean;
  isModerator(userID: StringUserID): boolean;
  isDraupnirUserPowered(draupnirUserID: StringUserID): boolean;
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

  public isDraupnirUserPowered(draupnirUserID: StringUserID): boolean {
    const powerLevelEvent =
      this.stateIssuer.currentRevision.getStateEvent<PowerLevelsEvent>(
        "m.room.power_levels",
        ""
      );

    const createEvent =
      this.stateIssuer.currentRevision.getStateEvent<RoomCreateEvent>(
        "m.room.create",
        ""
      );
    if (powerLevelEvent === undefined || createEvent === undefined) {
      throw new TypeError("Unable to fetch management room state");
    }
    if (
      PowerLevelsMirror.isUserAbleToUse(
        draupnirUserID,
        PowerLevelPermission.StateDefault,
        createEvent,
        powerLevelEvent.content
      )
    ) {
      return true;
    }
    return false;
  }
}
