// SPDX-FileCopyrightText: 2025 - 2026 Gnuxie <Gnuxie@protonmail.com>
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
  ProjectionReduction,
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

type ServerBanIntentMap = PersistentMap<
  StringServerName,
  List<LiteralPolicyRule | GlobPolicyRule>
>;

// is there a way that we can adapt this so that it can possibly be swapped
// to a lazy ban style protection if acls become exhausted.
// not withiout addressing the issues in the member protection tbh.
export type ServerBanIntentProjectionNode = ProjectionNode<
  [PolicyListBridgeProjectionNode],
  ServerBanIntentProjectionDelta,
  {
    deny: StringServerName[];
    isServerDenied(serverName: StringServerName): boolean;
  }
>;

export class StandardServerBanIntentProjectionNode implements ServerBanIntentProjectionNode {
  public readonly ulid: ULID;
  constructor(
    private readonly ulidFactory: ULIDFactory,
    private readonly policies: ServerBanIntentMap
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

  diff(
    nextNode: ServerBanIntentProjectionNode
  ): ServerBanIntentProjectionDelta {
    const deny: StringServerName[] = [];
    const recall: StringServerName[] = [];
    for (const serverName of nextNode.deny) {
      if (!this.isServerDenied(serverName)) {
        deny.push(serverName);
      }
    }
    for (const serverName of this.policies.keys()) {
      if (!nextNode.isServerDenied(serverName)) {
        recall.push(serverName);
      }
    }
    return { deny, recall };
  }

  reduceInput(
    input: PolicyRuleChange[]
  ): ProjectionReduction<
    ServerBanIntentProjectionNode,
    ServerBanIntentProjectionDelta
  > {
    let nextPolicies = this.policies;
    for (const change of input) {
      if (
        change.rule.kind !== PolicyRuleType.Server ||
        change.rule.matchType === PolicyRuleMatchType.HashedLiteral
      ) {
        continue;
      }
      switch (change.changeType) {
        case PolicyRuleChangeType.Added:
        case PolicyRuleChangeType.RevealedLiteral: {
          nextPolicies = ListMultiMap.add(
            nextPolicies,
            change.rule.entity as StringServerName,
            change.rule
          );
          break;
        }
        case PolicyRuleChangeType.Modified: {
          if (change.previousRule === undefined) {
            throw new TypeError("Things are very wrong");
          }
          nextPolicies = ListMultiMap.add(
            nextPolicies,
            change.rule.entity as StringServerName,
            change.rule
          );
          if (
            change.previousRule.kind !== PolicyRuleType.Server ||
            change.previousRule.matchType === PolicyRuleMatchType.HashedLiteral
          ) {
            break;
          }
          nextPolicies = ListMultiMap.remove(
            nextPolicies,
            change.previousRule.entity as StringServerName,
            change.previousRule
          );
          break;
        }
        case PolicyRuleChangeType.Removed: {
          nextPolicies = ListMultiMap.remove(
            nextPolicies,
            change.rule.entity as StringServerName,
            change.rule
          );
          break;
        }
      }
    }
    const nextNode = new StandardServerBanIntentProjectionNode(
      this.ulidFactory,
      nextPolicies
    );
    return {
      downstreamDelta: this.diff(nextNode),
      nextNode,
    };
  }

  reduceInitialInputs([policyListRevision]: [
    PolicyListBridgeProjectionNode,
  ]): ProjectionReduction<
    ServerBanIntentProjectionNode,
    ServerBanIntentProjectionDelta
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
    let nextPolicies = PersistentMap<
      StringServerName,
      List<LiteralPolicyRule | GlobPolicyRule>
    >();
    for (const policy of serverPolicies) {
      nextPolicies = ListMultiMap.add(
        nextPolicies,
        policy.entity as StringServerName,
        policy
      );
    }
    const nextNode = new StandardServerBanIntentProjectionNode(
      this.ulidFactory,
      nextPolicies
    );
    return {
      downstreamDelta: this.diff(nextNode),
      nextNode,
    };
  }

  isEmpty(): boolean {
    return this.policies.size === 0;
  }

  get deny(): StringServerName[] {
    return [...this.policies.keys()];
  }

  isServerDenied(serverName: StringServerName): boolean {
    return this.policies.has(serverName);
  }
}
