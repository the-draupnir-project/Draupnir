// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result } from "@gnuxie/typescript-result";
import { RoomBanner } from "../../../Client/RoomBanner";
import { SetRoomMembership } from "../../../Membership/SetRoomMembership";
import { Capability, describeCapabilityProvider } from "../CapabilityProvider";
import {
  StandardUserConsequences,
  StandardUserConsequencesContext,
} from "./StandardUserConsequences";
import { TargetMember, UserConsequences } from "./UserConsequences";
import { RoomUnbanner } from "../../../Client/RoomUnbanner";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ResultForUsersInRoom,
  ResultForUsersInSet,
  RoomSetResult,
} from "./RoomSetResult";

const FakeRoomBanner = Object.freeze({
  banUser(_room, _userID, _reason) {
    return Promise.resolve(Ok(undefined));
  },
} satisfies RoomBanner);

const FakeRoomUnbanner = Object.freeze({
  unbanUser(_room, _userID, _reason) {
    return Promise.resolve(Ok(undefined));
  },
} satisfies RoomUnbanner);

export class SimulatedUserConsequences implements UserConsequences, Capability {
  public readonly requiredPermissions = [];
  public readonly requiredEventPermissions = [];
  public readonly requiredStatePermissions = [];
  public readonly isSimulated = true;
  private readonly simulatedCapability;
  public constructor(private readonly setMembership: SetRoomMembership) {
    this.simulatedCapability = new StandardUserConsequences(
      FakeRoomBanner,
      FakeRoomUnbanner,
      this.setMembership
    );
  }
  public async consequenceForUserInRoom(
    roomID: StringRoomID,
    user: StringUserID,
    reason: string
  ): Promise<Result<void>> {
    return await this.simulatedCapability.consequenceForUserInRoom(
      roomID,
      user,
      reason
    );
  }
  public async consequenceForUsersInRoom(
    roomID: StringRoomID,
    users: TargetMember[]
  ): Promise<Result<ResultForUsersInRoom>> {
    return await this.simulatedCapability.consequenceForUsersInRoom(
      roomID,
      users
    );
  }
  public async consequenceForUsersInRoomSet(
    users: TargetMember[]
  ): Promise<Result<ResultForUsersInSet>> {
    return await this.simulatedCapability.consequenceForUsersInRoomSet(users);
  }
  public async unbanUserFromRoomSet(
    userID: StringUserID,
    reason: string
  ): Promise<Result<RoomSetResult>> {
    return await this.simulatedCapability.unbanUserFromRoomSet(userID, reason);
  }
}

describeCapabilityProvider({
  name: "SimulatedUserConsequences",
  description:
    "Simulates banning users from the protected rooms set, but has no real effects",
  interface: "UserConsequences",
  isSimulated: true,
  factory(_description, context: StandardUserConsequencesContext) {
    return new SimulatedUserConsequences(context.setMembership);
  },
});
