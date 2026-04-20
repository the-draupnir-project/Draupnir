// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { StringServerName } from "@the-draupnir-project/matrix-basic-types";
import {
  ProjectionNode,
  ProjectionNodeDelta,
} from "../../../Projection/ProjectionNode";
import { PolicyListBridgeProjectionNode } from "./PolicyListBridgeProjection";
import {
  PolicyRuleChange,
  PolicyRuleChangeType,
} from "../../../PolicyList/PolicyRuleChange";
import { ULID, ULIDFactory } from "ulidx";
import {
  GlobPolicyRule,
  LiteralPolicyRule,
  PolicyRuleMatchType,
  Recommendation,
} from "../../../PolicyList/PolicyRule";
import { Map as PersistentMap, List } from "immutable";
import { PolicyRuleType } from "../../../MatrixTypes/PolicyEvents";
import { ListMultiMap } from "../../../Projection/ListMultiMap";

export type ServerBanIntentProjectionDelta = {
  deny: StringServerName[];
  recall: StringServerName[];
};

export type ServerBanIntentProjectionStateDelta = {
  add: (LiteralPolicyRule | GlobPolicyRule)[];
  remove: (LiteralPolicyRule | GlobPolicyRule)[];
};

// is there a way that we can adapt this so that it can possibly be swapped
// to a lazy ban style protection if acls become exhausted.
// not withiout addressing the issues in the member protection tbh.
export type ServerBanIntentProjectionNode = ProjectionNode<
  [PolicyListBridgeProjectionNode],
  ServerBanIntentProjectionDelta,
  ServerBanIntentProjectionStateDelta,
  {
    deny: StringServerName[];
  }
>;

export const ServerBanIntentProjectionHelper = Object.freeze({
  reducePolicyDelta(
    input: PolicyRuleChange[]
  ): ServerBanIntentProjectionStateDelta {
    const output: ServerBanIntentProjectionStateDelta = {
      add: [],
      remove: [],
    };
    for (const change of input) {
      if (change.rule.kind !== PolicyRuleType.Server) {
        continue;
      } else if (change.rule.matchType === PolicyRuleMatchType.HashedLiteral) {
        continue;
      }
      switch (change.changeType) {
        case PolicyRuleChangeType.Added:
        case PolicyRuleChangeType.RevealedLiteral: {
          output.add.push(change.rule);
          break;
        }
        case PolicyRuleChangeType.Modified: {
          output.add.push(change.rule);
          if (change.previousRule === undefined) {
            throw new TypeError("Things are very wrong");
          }
          output.remove.push(change.previousRule as LiteralPolicyRule);
          break;
        }
        case PolicyRuleChangeType.Removed: {
          output.remove.push(change.rule);
          break;
        }
      }
    }
    return output;
  },

  reduceIntentDelta(
    input: ServerBanIntentProjectionStateDelta,
    policies: PersistentMap<
      StringServerName,
      List<GlobPolicyRule | LiteralPolicyRule>
    >
  ): ServerBanIntentProjectionDelta {
    const intents = ListMultiMap.deriveIntents(
      policies,
      input.add,
      input.remove,
      (rule) => rule.entity as StringServerName
    );
    return {
      deny: intents.intend,
      recall: intents.recall,
    };
  },
});

export class StandardServerBanIntentProjectionNode implements ServerBanIntentProjectionNode {
  public readonly ulid: ULID;
  constructor(
    private readonly ulidFactory: ULIDFactory,
    private readonly policies: PersistentMap<
      StringServerName,
      List<LiteralPolicyRule | GlobPolicyRule>
    >
  ) {
    this.ulid = ulidFactory();
  }

  public static create(
    ulidFactory: ULIDFactory
  ): ServerBanIntentProjectionNode {
    return new StandardServerBanIntentProjectionNode(
      ulidFactory,
      PersistentMap()
    );
  }

  reduceInput(
    input: PolicyRuleChange[]
  ): ProjectionNodeDelta<
    ServerBanIntentProjectionDelta,
    ServerBanIntentProjectionStateDelta
  > {
    const nodeStateDelta =
      ServerBanIntentProjectionHelper.reducePolicyDelta(input);
    return {
      downstreamDelta: ServerBanIntentProjectionHelper.reduceIntentDelta(
        nodeStateDelta,
        this.policies
      ),
      nodeStateDelta,
    };
  }

  reduceInitialInputs([policyListRevision]: [
    PolicyListBridgeProjectionNode,
  ]): ProjectionNodeDelta<
    ServerBanIntentProjectionDelta,
    ServerBanIntentProjectionStateDelta
  > {
    if (!this.isEmpty()) {
      throw new TypeError("Cannot reduce initial inputs when inialised");
    }
    const serverPolicies = [
      ...policyListRevision.allRulesOfType(
        PolicyRuleType.Server,
        Recommendation.Ban
      ),
      ...policyListRevision.allRulesOfType(
        PolicyRuleType.Server,
        Recommendation.Takedown
      ),
    ].filter((rule) => rule.matchType !== PolicyRuleMatchType.HashedLiteral);
    const names = new Set(serverPolicies.map((policy) => policy.entity));
    const downstreamDelta = {
      deny: [...names] as StringServerName[],
      recall: [],
    };
    const nodeStateDelta = {
      add: serverPolicies,
      remove: [],
    };
    return {
      downstreamDelta,
      nodeStateDelta,
    };
  }

  isEmpty(): boolean {
    return this.policies.size === 0;
  }

  reduceDelta({
    nodeStateDelta: input,
  }: ProjectionNodeDelta<
    ServerBanIntentProjectionDelta,
    ServerBanIntentProjectionStateDelta
  >): ServerBanIntentProjectionNode {
    let nextPolicies = this.policies;
    nextPolicies = ListMultiMap.addValues(
      nextPolicies,
      input.add,
      (rule) => rule.entity as StringServerName
    );
    nextPolicies = ListMultiMap.removeValues(
      nextPolicies,
      input.remove,
      (rule) => rule.entity as StringServerName
    );
    return new StandardServerBanIntentProjectionNode(
      this.ulidFactory,
      nextPolicies
    );
  }

  get deny(): StringServerName[] {
    return [...this.policies.keys()];
  }
}
