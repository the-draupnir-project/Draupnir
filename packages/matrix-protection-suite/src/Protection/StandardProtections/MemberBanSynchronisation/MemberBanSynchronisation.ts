// Copyright 2022-2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionError,
  ActionResult,
  Ok,
  isError,
} from "../../../Interface/Action";
import {
  AbstractProtection,
  Protection,
  ProtectionDescription,
  describeProtection,
} from "../../Protection";
import {
  MembershipChange,
  MembershipChangeType,
} from "../../../Membership/MembershipChange";
import { RoomMembershipRevision } from "../../../Membership/MembershipRevision";
import { ProtectedRoomsSet } from "../../ProtectedRoomsSet";
import { PolicyRuleType } from "../../../MatrixTypes/PolicyEvents";
import { PolicyRule, Recommendation } from "../../../PolicyList/PolicyRule";
import { MultipleErrors } from "../../../Interface/MultipleErrors";
import { UserConsequences } from "../../Capability/StandardCapability/UserConsequences";
import "../../Capability/StandardCapability/UserConsequences"; // need this to load the interface.
import "../../Capability/StandardCapability/StandardUserConsequences"; // need this to load the providers.
import { Task } from "../../../Interface/Task";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { UnknownConfig } from "../../../Config/ConfigDescription";
import {
  MemberPolicyMatches,
  SetMembershipPolicyRevision,
} from "../../../MembershipPolicies/MembershipPolicyRevision";
import { OwnLifetime } from "../../../Interface/Lifetime";
import {
  MemberBanIntentProjection,
  StandardMemberBanIntentProjection,
} from "./MemberBanIntentProjection";

function isRecommendationWorthBanning(policyRule: PolicyRule) {
  return (
    policyRule.recommendation === Recommendation.Ban ||
    policyRule.recommendation === Recommendation.Takedown
  );
}

function revisionMatchesWithUserBans(
  revision: SetMembershipPolicyRevision
): MemberPolicyMatches[] {
  return revision.allMembersWithRules().filter((match) =>
    match.policies.some(
      (policy) =>
        // We only ban for user policies and not server ones at the time being,
        // As this keeps ACL non-disruptive when it is necessary to temporarily
        // ban a server.
        policy.kind === PolicyRuleType.User &&
        isRecommendationWorthBanning(policy)
    )
  );
}

export type MemberBanSynchronisationProtectionDescription =
  ProtectionDescription<
    unknown,
    UnknownConfig,
    MemberBanSynchronisationProtectionCapabilities
  >;

export class MemberBanSynchronisationProtection
  extends AbstractProtection<MemberBanSynchronisationProtectionDescription>
  implements
    Protection<
      MemberBanSynchronisationProtectionDescription,
      MemberBanIntentProjection
    >
{
  private readonly userConsequences: UserConsequences;
  constructor(
    description: MemberBanSynchronisationProtectionDescription,
    lifetime: OwnLifetime<Protection<MemberBanSynchronisationProtection>>,
    capabilities: MemberBanSynchronisationProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    public readonly intentProjection: MemberBanIntentProjection
  ) {
    super(description, lifetime, capabilities, protectedRoomsSet, {});
    this.userConsequences = capabilities.userConsequences;
  }

  public handleSetMembershipPolicyMatchesChange(
    revision: SetMembershipPolicyRevision
  ): void {
    void Task(this.synchroniseWithRevision(revision));
  }

  // FIXME:
  // This is a legacy handle that needs to remain while we figure out how to
  // put room membership into the the protection's intent projection.
  // Which is a lot of work.
  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    // we need access to the policy list issuer from the protected rooms set.
    const directIssuer =
      this.protectedRoomsSet.watchedPolicyRooms.revisionIssuer;
    // then check the changes against the policies
    const errors: ActionError[] = [];
    for (const change of changes) {
      switch (change.membershipChangeType) {
        case MembershipChangeType.Banned:
        case MembershipChangeType.Kicked:
        case MembershipChangeType.Left:
        case MembershipChangeType.NoChange:
        case MembershipChangeType.Unbanned:
          continue;
      }
      const applicableRules = directIssuer.currentRevision
        .allRulesMatchingEntity(change.userID, {
          type: PolicyRuleType.User,
          searchHashedRules: false,
        })
        .filter(
          (rule) =>
            rule.recommendation === Recommendation.Ban ||
            rule.recommendation === Recommendation.Takedown
        );
      const firstRule = applicableRules[0];
      if (firstRule) {
        const result = await this.userConsequences.consequenceForUserInRoom(
          revision.room.toRoomIDOrAlias(),
          change.userID,
          firstRule.recommendation === Recommendation.Takedown
            ? "takedown"
            : (firstRule.reason ?? "<no reason provided>")
        );
        if (isError(result)) {
          errors.push(result.error);
        }
      }
    }
    if (errors.length > 1) {
      return MultipleErrors.Result(
        `There were errors when banning members in ${revision.room.toPermalink()}`,
        { errors }
      );
    } else {
      return Ok(undefined);
    }
  }

  public async synchroniseWithRevision(
    revision: SetMembershipPolicyRevision
  ): Promise<ActionResult<void>> {
    const result = await this.userConsequences.consequenceForUsersInRoomSet(
      revisionMatchesWithUserBans(revision)
    );
    if (isError(result)) {
      return result;
    } else {
      return Ok(undefined);
    }
  }

  public handlePermissionRequirementsMet(room: MatrixRoomID): void {
    void Task(
      (async () => {
        await this.userConsequences.consequenceForUsersInRoom(
          room.toRoomIDOrAlias(),
          revisionMatchesWithUserBans(
            this.protectedRoomsSet.setPoliciesMatchingMembership.currentRevision
          )
        );
      })()
    );
  }
}

export type MemberBanSynchronisationProtectionCapabilities = {
  userConsequences: UserConsequences;
};

describeProtection<MemberBanSynchronisationProtectionCapabilities>({
  name: "MemberBanSynchronisationProtection",
  description:
    "Synchronises `m.ban` events from watch policy lists with room level bans.",
  capabilityInterfaces: {
    userConsequences: "UserConsequences",
  },
  defaultCapabilities: {
    userConsequences: "StandardUserConsequences",
  },
  factory: async (
    decription,
    lifetime,
    protectedRoomsSet,
    _settings,
    capabilitySet
  ) => {
    const intentProjection = lifetime.allocateDisposable(() =>
      Ok(
        new StandardMemberBanIntentProjection(
          protectedRoomsSet.setPoliciesMatchingMembership
        )
      )
    );
    if (isError(intentProjection)) {
      return intentProjection.elaborate("Unable to allocate intent projection");
    }
    return Ok(
      new MemberBanSynchronisationProtection(
        decription,
        lifetime,
        capabilitySet,
        protectedRoomsSet,
        intentProjection.ok
      )
    );
  },
});
