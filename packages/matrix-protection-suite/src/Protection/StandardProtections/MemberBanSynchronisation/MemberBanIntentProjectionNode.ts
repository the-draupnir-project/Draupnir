// SPDX-FileCopyrightText: 2025 - 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { ULID, ULIDFactory } from "ulidx";
import {
  ExtractInputDeltaShapes,
  ProjectionNode,
  ProjectionReduction,
} from "../../../Projection/ProjectionNode";
import {
  MemberPolicyMatches,
  MembershipPolicyRevision,
  MembershipPolicyRevisionDelta,
} from "../../../MembershipPolicies/MembershipPolicyRevision";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { List, Map as PersistentMap } from "immutable";
import {
  GlobPolicyRule,
  LiteralPolicyRule,
  Recommendation,
} from "../../../PolicyList/PolicyRule";
import { ListMultiMap } from "../../../Projection/ListMultiMap";

/**
 * This is just a stand in while we wait to convert the upstream MembershipPolicyRevision
 * to a projection.
 */
export type MemberBanInputProjectionNode = ProjectionNode<
  never[],
  MembershipPolicyRevisionDelta
> &
  MembershipPolicyRevision;

export interface MemberBanIntentProjectionDelta {
  ban: StringUserID[];
  recall: StringUserID[];
}

type MemberBanIntentMap = PersistentMap<
  StringUserID,
  List<LiteralPolicyRule | GlobPolicyRule>
>;

function isPolicyRelevant(policy: LiteralPolicyRule | GlobPolicyRule): boolean {
  return (
    policy.recommendation === Recommendation.Ban ||
    policy.recommendation === Recommendation.Takedown
  );
}

export type MemberBanIntentProjectionNode = ProjectionNode<
  [MemberBanInputProjectionNode],
  MemberBanIntentProjectionDelta,
  {
    allMembersWithRules(): MemberPolicyMatches[];
    isMemberBanned(member: StringUserID): boolean;
    allRulesMatchingMember(
      member: StringUserID
    ): (LiteralPolicyRule | GlobPolicyRule)[];
  }
>;

// Upstream inputs are not yet converted to projections, so have to be never[]
// for now.
export class StandardMemberBanIntentProjectionNode implements MemberBanIntentProjectionNode {
  public readonly ulid: ULID;
  constructor(
    private readonly ulidFactory: ULIDFactory,
    private readonly intents: MemberBanIntentMap
  ) {
    this.ulid = ulidFactory();
  }

  public static create(
    ulidFactory: ULIDFactory
  ): MemberBanIntentProjectionNode {
    return new StandardMemberBanIntentProjectionNode(
      ulidFactory,
      PersistentMap()
    );
  }

  public isEmpty(): boolean {
    return this.intents.isEmpty();
  }

  public diff(
    nextNode: MemberBanIntentProjectionNode
  ): MemberBanIntentProjectionDelta {
    const ban: StringUserID[] = [];
    const recall: StringUserID[] = [];
    for (const member of nextNode.allMembersWithRules()) {
      if (!this.isMemberBanned(member.userID)) {
        ban.push(member.userID);
      }
    }
    for (const userID of this.intents.keys()) {
      if (!nextNode.isMemberBanned(userID)) {
        recall.push(userID);
      }
    }
    return { ban, recall };
  }

  reduceInput(
    input: ExtractInputDeltaShapes<[MemberBanInputProjectionNode]>
  ): ProjectionReduction<
    MemberBanIntentProjectionNode,
    MemberBanIntentProjectionDelta
  > {
    let nextIntents = this.intents;
    for (const added of input.addedMemberMatches) {
      if (isPolicyRelevant(added.policy)) {
        nextIntents = ListMultiMap.add(nextIntents, added.userID, added.policy);
      }
    }
    for (const removed of input.removedMemberMatches) {
      if (isPolicyRelevant(removed.policy)) {
        nextIntents = ListMultiMap.remove(
          nextIntents,
          removed.userID,
          removed.policy
        );
      }
    }
    const nextNode = new StandardMemberBanIntentProjectionNode(
      this.ulidFactory,
      nextIntents
    );
    return {
      downstreamDelta: this.diff(nextNode),
      nextNode,
    };
  }

  reduceInitialInputs([membershipPolicyRevision]: [
    MemberBanInputProjectionNode,
  ]): ProjectionReduction<
    MemberBanIntentProjectionNode,
    MemberBanIntentProjectionDelta
  > {
    if (!this.isEmpty()) {
      throw new TypeError(
        "This can only be called on an empty projection node"
      );
    }
    const matches = membershipPolicyRevision
      .allMembersWithRules()
      .map((member) =>
        member.policies
          .filter(isPolicyRelevant)
          .map((policy) => ({ userID: member.userID, policy }))
      )
      .flat();
    let nextIntents = PersistentMap<
      StringUserID,
      List<LiteralPolicyRule | GlobPolicyRule>
    >();
    for (const match of matches) {
      nextIntents = ListMultiMap.add(nextIntents, match.userID, match.policy);
    }
    const nextNode = new StandardMemberBanIntentProjectionNode(
      this.ulidFactory,
      nextIntents
    );
    return {
      downstreamDelta: this.diff(nextNode),
      nextNode,
    };
  }

  allMembersWithRules(): MemberPolicyMatches[] {
    return this.intents.reduce<MemberPolicyMatches[]>(
      (matches, policyRules, userID) => {
        matches.push({
          userID: userID,
          policies: policyRules.toArray(),
        });
        return matches;
      },
      []
    );
  }

  isMemberBanned(member: StringUserID): boolean {
    return this.intents.has(member);
  }

  allRulesMatchingMember(
    member: StringUserID
  ): (LiteralPolicyRule | GlobPolicyRule)[] {
    return this.intents
      .get(member, List<LiteralPolicyRule | GlobPolicyRule>())
      .toArray();
  }
}
