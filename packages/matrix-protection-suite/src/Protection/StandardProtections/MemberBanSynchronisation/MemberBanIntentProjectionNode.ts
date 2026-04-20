// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
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
  ProjectionNodeDelta,
} from "../../../Projection/ProjectionNode";
import {
  MemberPolicyMatch,
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
  MembershipPolicyRevisionDelta,
  undefined
> &
  MembershipPolicyRevision;

// use add/remove for steady state intents
// When the intent becomes effectual, matches will be removed
// upstream and so this model will remain consistent
export interface MemberBanIntentProjectionDelta {
  add: MemberPolicyMatch[];
  remove: MemberPolicyMatch[];
  ban: StringUserID[];
  recall: StringUserID[];
}

function isPolicyRelevant(policy: LiteralPolicyRule | GlobPolicyRule): boolean {
  return (
    policy.recommendation === Recommendation.Ban ||
    policy.recommendation === Recommendation.Takedown
  );
}

export type MemberBanIntentProjectionNode = ProjectionNode<
  [MemberBanInputProjectionNode],
  MemberBanIntentProjectionDelta,
  undefined,
  {
    allMembersWithRules(): MemberPolicyMatches[];
    allRulesMatchingMember(
      member: StringUserID
    ): (LiteralPolicyRule | GlobPolicyRule)[];
  }
>;

export const MemberBanIntentProjectionNodeHelper = Object.freeze({
  reduceMembershipPolicyDelta(
    input: MembershipPolicyRevisionDelta
  ): Pick<MemberBanIntentProjectionDelta, "add" | "remove"> {
    const output: Pick<MemberBanIntentProjectionDelta, "add" | "remove"> = {
      add: [],
      remove: [],
    };
    for (const added of input.addedMemberMatches) {
      if (isPolicyRelevant(added.policy)) {
        output.add.push(added);
      }
    }
    for (const removed of input.removedMemberMatches) {
      if (isPolicyRelevant(removed.policy)) {
        output.remove.push(removed);
      }
    }
    return output;
  },
  reduceIntentDelta(
    input: Pick<MemberBanIntentProjectionDelta, "add" | "remove">,
    policies: PersistentMap<
      StringUserID,
      List<LiteralPolicyRule | GlobPolicyRule>
    >
  ): MemberBanIntentProjectionDelta {
    const intents = ListMultiMap.deriveIntents(
      policies,
      input.add.map((match) => match.policy),
      input.remove.map((match) => match.policy),
      (rule) => rule.entity as StringUserID
    );
    return {
      ...input,
      ban: intents.intend,
      recall: intents.recall,
    };
  },
});

// Upstream inputs are not yet converted to projections, so have to be never[]
// for now.
export class StandardMemberBanIntentProjectionNode implements MemberBanIntentProjectionNode {
  public readonly ulid: ULID;
  constructor(
    private readonly ulidFactory: ULIDFactory,
    private readonly intents: PersistentMap<
      StringUserID,
      List<LiteralPolicyRule | GlobPolicyRule>
    >
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

  reduceInput(
    input: ExtractInputDeltaShapes<[MemberBanInputProjectionNode]>
  ): ProjectionNodeDelta<MemberBanIntentProjectionDelta, undefined> {
    return {
      downstreamDelta: MemberBanIntentProjectionNodeHelper.reduceIntentDelta(
        MemberBanIntentProjectionNodeHelper.reduceMembershipPolicyDelta(input),
        this.intents
      ),
      nodeStateDelta: undefined,
    };
  }

  reduceDelta(
    projectionNodeDelta: ProjectionNodeDelta<
      MemberBanIntentProjectionDelta,
      undefined
    >
  ): MemberBanIntentProjectionNode {
    const input = projectionNodeDelta.downstreamDelta;
    let nextIntents = this.intents;
    nextIntents = ListMultiMap.addValues(
      nextIntents,
      input.add.map((match) => match.policy),
      (rule) => rule.entity as StringUserID
    );
    nextIntents = ListMultiMap.removeValues(
      nextIntents,
      input.remove.map((match) => match.policy),
      (rule) => rule.entity as StringUserID
    );
    return new StandardMemberBanIntentProjectionNode(
      this.ulidFactory,
      nextIntents
    );
  }

  reduceInitialInputs([membershipPolicyRevision]: [
    MemberBanInputProjectionNode,
  ]): ProjectionNodeDelta<MemberBanIntentProjectionDelta, undefined> {
    if (!this.isEmpty()) {
      throw new TypeError(
        "This can only be called on an empty projection node"
      );
    }
    const matches = membershipPolicyRevision
      .allMembersWithRules()
      .map((member) =>
        member.policies.map((policy) => ({ userID: member.userID, policy }))
      )
      .flat();
    return {
      downstreamDelta: {
        add: matches,
        ban: matches.map((match) => match.userID),
        remove: [],
        recall: [],
      },
      nodeStateDelta: undefined,
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

  allRulesMatchingMember(
    member: StringUserID
  ): (LiteralPolicyRule | GlobPolicyRule)[] {
    return this.intents
      .get(member, List<LiteralPolicyRule | GlobPolicyRule>())
      .toArray();
  }
}
