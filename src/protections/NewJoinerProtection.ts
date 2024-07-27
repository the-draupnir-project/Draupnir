// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AbstractProtection,
  ActionError,
  ActionResult,
  MembershipChange,
  MembershipChangeType,
  MultipleErrors,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomMembershipRevision,
  UnknownSettings,
  UserConsequences,
  describeProtection,
  isError,
  serverName,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { IConfig } from "../config";

export type NewJoinerProtectionDescription = ProtectionDescription<
  unknown,
  UnknownSettings<string>,
  NewJoinerProtectionCapabilities
>;

export class NewJoinerProtection
  extends AbstractProtection<NewJoinerProtectionDescription>
  implements Protection<NewJoinerProtectionDescription>
{
  private readonly userConsequences: UserConsequences;
  private readonly bannedServers: Set<string>;
  private readonly banReason: string;
  constructor(
    description: NewJoinerProtectionDescription,
    capabilities: NewJoinerProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    draupnirConfig: IConfig
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.userConsequences = capabilities.userConsequences;
    this.bannedServers = new Set(
      draupnirConfig.protections.newJoinerProtection.serverNames
    );
    this.banReason = draupnirConfig.protections.newJoinerProtection.banMessage;
  }

  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    const errors: ActionError[] = [];
    for (const change of changes) {
      if (change.membershipChangeType === MembershipChangeType.Joined) {
        if (this.bannedServers.has(serverName(change.userID))) {
          const banResult =
            await this.userConsequences.consequenceForUserInRoom(
              revision.room.toRoomIDOrAlias(),
              change.userID,
              this.banReason
            );
          if (isError(banResult)) {
            errors.push(banResult.error);
          }
        }
      }
    }
    if (errors.length === 0) {
      return Ok(undefined);
    } else {
      return MultipleErrors.Result(
        `There were errors when banning members in ${revision.room.toPermalink()}`,
        { errors }
      );
    }
  }
}

export type NewJoinerProtectionCapabilities = {
  userConsequences: UserConsequences;
};

describeProtection<NewJoinerProtectionCapabilities, Draupnir>({
  name: "NewJoinerProtection",
  description: `Highly experimental protection that will ban all new joiners from configured homeservers.
    Will not ban existing users from those servers, and unbanning users will allow them to join normally.
    Please read the documentation https://the-draupnir-project.github.io/draupnir-documentation/protections/new-joiner-protection.`,
  capabilityInterfaces: {
    userConsequences: "UserConsequences",
  },
  defaultCapabilities: {
    userConsequences: "StandardUserConsequences",
  },
  factory: (decription, protectedRoomsSet, draupnir, capabilitySet) =>
    Ok(
      new NewJoinerProtection(
        decription,
        capabilitySet,
        protectedRoomsSet,
        draupnir.config
      )
    ),
});
