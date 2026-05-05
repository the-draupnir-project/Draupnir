// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixGlob } from "@the-draupnir-project/matrix-basic-types";
import {
  PolicyRuleEvent,
  PolicyRuleType,
  UnredactedPolicyContent,
  normalisePolicyRuleType,
} from "../MatrixTypes/PolicyEvents";
import { Ok, Result, ResultError } from "@gnuxie/typescript-result";

export enum Recommendation {
  /// The rule recommends a "ban".
  ///
  /// The actual semantics for this "ban" may vary, e.g. room ban,
  /// server ban, ignore user, etc. To determine the semantics for
  /// this "ban", clients need to take into account the context for
  /// the list, e.g. how the rule was imported.
  Ban = "m.ban",

  /**
   * This is a rule that recommends allowing a user to participate.
   * Used for the construction of allow lists.
   */
  Allow = "org.matrix.mjolnir.allow",
  /**
   * This recommendation is to takedown the entity and is usually reserved
   * for content that needs to be removed asap.
   */
  Takedown = "org.matrix.msc4204.takedown",
  Unknown = "unknown",
}

/**
 * All variants of recommendation `m.ban`
 */
const RECOMMENDATION_BAN_VARIANTS = [
  // Stable
  Recommendation.Ban,
  // Unstable prefix, for compatibility.
  "org.matrix.mjolnir.ban",
];

const RECOMMENDATION_ALLOW_VARIANTS: string[] = [
  // Unstable
  Recommendation.Allow,
];

const RECOMMENDATION_TAKEDOWN_VARIANTS: string[] = [
  Recommendation.Takedown,
  "m.takedown",
];

export function normaliseRecommendation(
  recommendation: string
): Recommendation {
  if (RECOMMENDATION_BAN_VARIANTS.includes(recommendation)) {
    return Recommendation.Ban;
  } else if (RECOMMENDATION_ALLOW_VARIANTS.includes(recommendation)) {
    return Recommendation.Allow;
  } else if (RECOMMENDATION_TAKEDOWN_VARIANTS.includes(recommendation)) {
    return Recommendation.Takedown;
  } else {
    return Recommendation.Unknown;
  }
}

export function makeReversedHashedPolicy(
  entity: string,
  hashedPolicy: HashedLiteralPolicyRule
): LiteralPolicyRule {
  return Object.freeze({
    entity,
    kind: hashedPolicy.kind,
    recommendation: hashedPolicy.recommendation,
    sourceEvent: hashedPolicy.sourceEvent,
    reason: hashedPolicy.reason ?? "<no reason supplied>",
    matchType: PolicyRuleMatchType.Literal,
    isMatch(this: LiteralPolicyRule, entity: string) {
      return this.entity === entity;
    },
    isReversedFromHashedPolicy: true,
  } satisfies LiteralPolicyRule);
}

export function parsePolicyRule(
  event: Omit<PolicyRuleEvent, "content"> & { content: UnredactedPolicyContent }
): Result<PolicyRule> {
  if (!("entity" in event.content)) {
    const hashes =
      // we need the expressions mare:
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      ("hashes" in event.content && event.content.hashes) ||
      ("org.matrix.msc4205.hashes" in event.content &&
        event.content["org.matrix.msc4205.hashes"]);
    if (!hashes) {
      return ResultError.Result("There is a missing entity in the policy rule");
    }
    return Ok(
      Object.freeze({
        recommendation: normaliseRecommendation(event.content.recommendation),
        kind: normalisePolicyRuleType(event.type),
        hashes,
        sourceEvent: event,
        matchType: PolicyRuleMatchType.HashedLiteral,
        ...(event.content.reason ? { reason: event.content.reason } : {}),
      }) satisfies HashedLiteralPolicyRule
    );
  }
  if (/[*?]/.test(event.content.entity)) {
    return Ok(
      Object.freeze({
        glob: new MatrixGlob(event.content.entity),
        entity: event.content.entity,
        recommendation: normaliseRecommendation(event.content.recommendation),
        kind: normalisePolicyRuleType(event.type),
        sourceEvent: event,
        matchType: PolicyRuleMatchType.Glob,
        reason: event.content.reason ?? "<no reason supplied>",
        isMatch(this: GlobPolicyRule, entity: string) {
          return this.glob.test(entity);
        },
      } satisfies GlobPolicyRule)
    );
  } else {
    return Ok(
      Object.freeze({
        entity: event.content.entity,
        recommendation: normaliseRecommendation(event.content.recommendation),
        kind: normalisePolicyRuleType(event.type),
        sourceEvent: event,
        matchType: PolicyRuleMatchType.Literal,
        reason: event.content.reason ?? "<no reason supplied>",
        isMatch(this: LiteralPolicyRule, entity: string) {
          return this.entity === entity;
        },
      } satisfies LiteralPolicyRule)
    );
  }
}

export enum PolicyRuleMatchType {
  Literal = "literal",
  Glob = "glob",
  HashedLiteral = "hashed-literal",
}

type PolicyRuleBase = {
  readonly recommendation: Recommendation;
  readonly reason?: string;
  readonly kind: PolicyRuleType;
  readonly sourceEvent: PolicyRuleEvent;
  readonly matchType: PolicyRuleMatchType;
  readonly isReversedFromHashedPolicy?: boolean;
};

export type LiteralPolicyRule = PolicyRuleBase & {
  readonly entity: string;
  readonly matchType: PolicyRuleMatchType.Literal;
  readonly reason: string;
  isMatch(entity: string): boolean;
};

export type GlobPolicyRule = PolicyRuleBase & {
  readonly entity: string;
  readonly glob: MatrixGlob;
  readonly matchType: PolicyRuleMatchType.Glob;

  isMatch(entity: string): boolean;
};

export type HashedLiteralPolicyRule = PolicyRuleBase & {
  readonly hashes: Record<string, string>;
  readonly matchType: PolicyRuleMatchType.HashedLiteral;
};

export type PolicyRule =
  | LiteralPolicyRule
  | GlobPolicyRule
  | HashedLiteralPolicyRule;
export type EntityPolicyRule = LiteralPolicyRule | GlobPolicyRule;
