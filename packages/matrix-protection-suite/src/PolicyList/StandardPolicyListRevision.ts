// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { PolicyRuleType } from "../MatrixTypes/PolicyEvents";
import { EntityMatchOptions, PolicyListRevision } from "./PolicyListRevision";
import {
  EntityPolicyRule,
  GlobPolicyRule,
  HashedLiteralPolicyRule,
  LiteralPolicyRule,
  PolicyRule,
  PolicyRuleMatchType,
  Recommendation,
} from "./PolicyRule";
import { PolicyRuleChange, PolicyRuleChangeType } from "./PolicyRuleChange";
import { Revision } from "./Revision";
import { Map as PersistentMap, List as PersistentList } from "immutable";
import { StringEventID } from "@the-draupnir-project/matrix-basic-types";
import { SHA256 } from "crypto-js";
import Base64 from "crypto-js/enc-base64";
import { Logger } from "../Logging/Logger";

const log = new Logger("StandardPolicyListRevision");

/**
 * A map of policy rules, by their type and then event id.
 */
type PolicyRuleByType = PersistentMap<
  PolicyRuleType,
  PersistentMap<StringEventID, PolicyRule>
>;

type PolicyRuleScopes = PersistentMap<
  PolicyRuleType,
  PersistentMap<Recommendation, PolicyRuleScope>
>;

/**
 * A standard implementation of a `PolicyListRevision` using immutable's persistent maps.
 */
export class StandardPolicyListRevision implements PolicyListRevision {
  /**
   * Use {@link StandardPolicyListRevision.blankRevision} to get started.
   * Only use this constructor if you are implementing a variant of PolicyListRevision.
   * @param revisionID A revision ID to represent this revision.
   * @param policyRules A map containing the rules for this revision by state type and then state key.
   * @param policyRuleByEventId A map containing the rules ofr this revision by event id.
   */
  public constructor(
    public readonly revisionID: Revision,
    /**
     * Allow us to detect whether we have updated the state for this event.
     */
    private readonly policyRuleByType: PolicyRuleByType,
    private readonly policyRuleScopes: PolicyRuleScopes
  ) {}

  /**
   * @returns An empty revision.
   */
  public static blankRevision(): StandardPolicyListRevision {
    return new StandardPolicyListRevision(
      new Revision(),
      PersistentMap(),
      PersistentMap()
    );
  }

  public isBlankRevision(): boolean {
    return this.policyRuleByType.isEmpty();
  }

  allRules(): PolicyRule[] {
    return [...this.policyRuleByType.values()]
      .map((byEventId) => [...byEventId.values()])
      .flat();
  }

  allRulesMatchingEntity(
    entity: string,
    {
      recommendation,
      type: ruleKind,
      searchHashedRules,
    }: Partial<EntityMatchOptions>
  ): PolicyRule[] {
    const ruleTypeOf = (entityPart: string): PolicyRuleType => {
      if (ruleKind) {
        return ruleKind;
      } else if (entityPart.startsWith("!") || entityPart.startsWith("#")) {
        return PolicyRuleType.Room;
      } else if (entity.startsWith("@")) {
        return PolicyRuleType.User;
      } else {
        return PolicyRuleType.Server;
      }
    };
    if (recommendation !== undefined) {
      const scope = this.policyRuleScopes
        .get(ruleTypeOf(entity))
        ?.get(recommendation);
      if (scope === undefined) {
        return [];
      }
      return scope.allRulesMatchingEntity(entity, Boolean(searchHashedRules));
    }
    return this.allRulesOfType(ruleTypeOf(entity), recommendation).filter(
      (rule) =>
        rule.matchType !== PolicyRuleMatchType.HashedLiteral &&
        rule.isMatch(entity)
    );
  }

  findRulesMatchingHash(
    hash: string,
    algorithm: string,
    {
      type,
      recommendation,
    }: Partial<Pick<EntityMatchOptions, "recommendation">> &
      Pick<EntityMatchOptions, "type">
  ): HashedLiteralPolicyRule[] {
    if (algorithm !== "sha256") {
      throw new TypeError("Unimplemented hash algorithm");
    }
    const allScopesForType = this.policyRuleScopes.get(type);
    if (allScopesForType === undefined) {
      return [];
    }
    const rules: HashedLiteralPolicyRule[] = [];
    const scopesToCheck = (() => {
      if (recommendation !== undefined) {
        const recommendationScope = allScopesForType.get(recommendation);
        if (recommendationScope === undefined) {
          return [];
        } else {
          return [recommendationScope];
        }
      } else {
        return [...allScopesForType.values()];
      }
    })();
    for (const scope of scopesToCheck) {
      rules.push(...scope.findHashRules(hash));
    }
    return rules;
  }

  findRuleMatchingEntity(
    entity: string,
    { recommendation, type, searchHashedRules }: EntityMatchOptions
  ): PolicyRule | undefined {
    const scope = this.policyRuleScopes.get(type)?.get(recommendation);
    if (scope === undefined) {
      return undefined;
    } else {
      return scope.findRuleMatchingEntity(entity, searchHashedRules);
    }
  }

  allRulesOfType(
    type: PolicyRuleType,
    recommendation?: Recommendation
  ): PolicyRule[] {
    const rules: PolicyRule[] = [];
    const eventIdMap = this.policyRuleByType.get(type);
    if (eventIdMap) {
      for (const rule of eventIdMap.values()) {
        if (rule.kind === type) {
          if (recommendation === undefined) {
            rules.push(rule);
          } else if (rule.recommendation === recommendation) {
            rules.push(rule);
          }
        }
      }
    }
    return rules;
  }

  public reviseFromChanges(
    changes: PolicyRuleChange[]
  ): StandardPolicyListRevision {
    let nextPolicyRulesByType = this.policyRuleByType;
    const setPolicyRule = (
      stateType: PolicyRuleType,
      rule: PolicyRule
    ): void => {
      const byEventTable =
        nextPolicyRulesByType.get(stateType) ?? PersistentMap();
      nextPolicyRulesByType = nextPolicyRulesByType.set(
        stateType,
        byEventTable.set(rule.sourceEvent.event_id, rule)
      );
    };
    const removePolicyRule = (rule: PolicyRule): void => {
      const byEventTable = nextPolicyRulesByType.get(rule.kind);
      if (byEventTable === undefined) {
        throw new TypeError(
          `Cannot find a rule for ${rule.sourceEvent.event_id}, this should be impossible`
        );
      }
      nextPolicyRulesByType = nextPolicyRulesByType.set(
        rule.kind,
        byEventTable.delete(rule.sourceEvent.event_id)
      );
    };
    for (const change of changes) {
      if (
        change.changeType === PolicyRuleChangeType.Added ||
        change.changeType === PolicyRuleChangeType.Modified
      ) {
        setPolicyRule(change.rule.kind, change.rule);
      } else if (change.changeType === PolicyRuleChangeType.RevealedLiteral) {
        if (
          this.policyRuleByType
            .get(change.rule.kind)
            ?.get(change.rule.sourceEvent.event_id)
        ) {
          setPolicyRule(change.rule.kind, change.rule);
        } else {
          // We need to discount revealed literals for rules we don't know about... because otherwise we could be interning removed rules.
          log.error(
            "got a RevealedLiteral for an unknown policy rule",
            change.rule
          );
        }
        // The code base could change, and then we'd be screwed:
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } else if (change.changeType === PolicyRuleChangeType.Removed) {
        removePolicyRule(change.rule);
      } else {
        throw new TypeError(`Unknown change type ${change.changeType}`);
      }
    }
    const nextRevisionID = new Revision();
    const changesByScope = groupChangesByScope(changes);
    const nextPolicyRuleScopes = flattenChangesByScope(changesByScope).reduce(
      (map, [policyRuleType, recommendation, changes]) => {
        const scopeEntry = map.getIn(
          [policyRuleType, recommendation],
          undefined
        ) as PolicyRuleScope | undefined;
        const byEventMap = nextPolicyRulesByType.get(
          policyRuleType,
          PersistentMap<StringEventID, PolicyRule>()
        );
        if (scopeEntry === undefined) {
          return map.setIn(
            [policyRuleType, recommendation],
            PolicyRuleScope.blankScope(
              nextRevisionID,
              policyRuleType,
              recommendation
            ).reviseFromChanges(nextRevisionID, changes, byEventMap)
          );
        } else {
          return map.setIn(
            [policyRuleType, recommendation],
            scopeEntry.reviseFromChanges(nextRevisionID, changes, byEventMap)
          );
        }
      },
      this.policyRuleScopes
    );
    return new StandardPolicyListRevision(
      nextRevisionID,
      nextPolicyRulesByType,
      nextPolicyRuleScopes
    );
  }
  hasEvent(eventId: string): boolean {
    return (
      [...this.policyRuleByType.values()].find((byEvent) =>
        byEvent.has(eventId as StringEventID)
      ) !== undefined
    );
  }
  hasPolicy(eventID: StringEventID): boolean {
    return this.hasEvent(eventID);
  }

  getPolicy(eventID: StringEventID): PolicyRule | undefined {
    const map = [...this.policyRuleByType.values()].find((byEvent) =>
      byEvent.has(eventID)
    );
    return map?.get(eventID);
  }
}

export type PolicyRuleChangeByScope = Map<
  PolicyRuleType,
  Map<Recommendation, PolicyRuleChange[]>
>;

export function groupChangesByScope(
  changes: PolicyRuleChange[]
): PolicyRuleChangeByScope {
  const changesByScope: PolicyRuleChangeByScope = new Map();
  const addChange = (change: PolicyRuleChange) => {
    const policyTypeEntry = changesByScope.get(change.rule.kind);
    if (policyTypeEntry === undefined) {
      const map = new Map<Recommendation, PolicyRuleChange[]>();
      map.set(change.rule.recommendation, [change]);
      changesByScope.set(change.rule.kind, map);
    } else {
      const recommendationEntry = policyTypeEntry.get(
        change.rule.recommendation
      );
      if (recommendationEntry === undefined) {
        policyTypeEntry.set(change.rule.recommendation, [change]);
      } else {
        recommendationEntry.push(change);
      }
    }
  };
  for (const change of changes) {
    addChange(change);
  }
  return changesByScope;
}

type FlatPolicyRuleChnageByScope = [
  PolicyRuleType,
  Recommendation,
  PolicyRuleChange[],
][];

function flattenChangesByScope(
  scopes: PolicyRuleChangeByScope
): FlatPolicyRuleChnageByScope {
  const flatChanges: FlatPolicyRuleChnageByScope = [];
  for (const [policyRuleType, changeByRecommendation] of scopes.entries()) {
    for (const [recommendation, changes] of changeByRecommendation.entries()) {
      flatChanges.push([policyRuleType, recommendation, changes]);
    }
  }
  return flatChanges;
}

type PolicyRuleByEntity<Rule extends EntityPolicyRule = EntityPolicyRule> =
  PersistentMap<string /*rule entity*/, PersistentList<Rule>>;

/**
 * A scope is a collection of rules that are scoped to a single entity type and
 * recommendation. So for the most basic policy list, there will usually be
 * a scope for all the `m.policy.rule.user` events that have the recommendation
 * `m.ban`.
 *
 * Scopes are built, quite painfully, to make rule lookup convienant and quick.
 * We accept this because revisions are few and far between, and if they are
 * frequent, will have a very small number of change events.
 */
class PolicyRuleScope {
  public static blankScope(
    revisionID: Revision,
    ruleType: PolicyRuleType,
    recommendation: Recommendation
  ): PolicyRuleScope {
    return new PolicyRuleScope(
      revisionID,
      ruleType,
      recommendation,
      PersistentMap(),
      PersistentMap(),
      PersistentMap()
    );
  }

  constructor(
    public readonly revisionID: Revision,
    /**
     * The entity type that this cache is for e.g. RULE_USER.
     */
    public readonly entityType: PolicyRuleType,
    /**
     * The recommendation that this cache is for e.g. m.ban (RECOMMENDATION_BAN).
     */
    public readonly recommendation: Recommendation,
    /**
     * Glob rules always have to be scanned against every entity.
     */
    private readonly globRules: PolicyRuleByEntity<GlobPolicyRule>,
    /**
     * This table allows us to skip matching an entity against every literal.
     */
    private readonly literalRules: PolicyRuleByEntity<LiteralPolicyRule>,
    /**
     * Hashed literal rules. This tables allows us to quickly find hashed rules.
     */
    private readonly sha256HashedLiteralRules: PersistentMap<
      string,
      PersistentList<HashedLiteralPolicyRule>
    >
  ) {
    // nothing to do.
  }
  reviseFromChanges(
    revision: Revision,
    changes: PolicyRuleChange[],
    rulesByEventID: PersistentMap<StringEventID, PolicyRule>
  ): PolicyRuleScope {
    const addRuleToMap = <Rule extends EntityPolicyRule = EntityPolicyRule>(
      map: PolicyRuleByEntity<Rule>,
      rule: Rule
    ): PolicyRuleByEntity<Rule> => {
      const rules = map.get(rule.entity) ?? PersistentList();
      return map.set(rule.entity, rules.push(rule));
    };
    const removeRuleFromMap = <
      Rule extends EntityPolicyRule = EntityPolicyRule,
    >(
      map: PolicyRuleByEntity<Rule>,
      ruleToRemove: Rule
    ): PolicyRuleByEntity<Rule> => {
      const rules = (map.get(ruleToRemove.entity) ?? PersistentList()).filter(
        (rule) =>
          rule.sourceEvent.event_id !== ruleToRemove.sourceEvent.event_id
      );
      if (rules.size === 0) {
        return map.delete(ruleToRemove.entity);
      } else {
        return map.set(ruleToRemove.entity, rules);
      }
    };
    let nextGlobRules = this.globRules;
    let nextLiteralRules = this.literalRules;
    let nextSha256LiteralRules = this.sha256HashedLiteralRules;
    const addRule = (rule: PolicyRule): void => {
      if (rule.matchType === PolicyRuleMatchType.Glob) {
        nextGlobRules = addRuleToMap(nextGlobRules, rule);
      } else if (rule.matchType === PolicyRuleMatchType.Literal) {
        nextLiteralRules = addRuleToMap(nextLiteralRules, rule);
      } else {
        const sha256 = rule.hashes["sha256"];
        if (sha256) {
          nextSha256LiteralRules = ((rules) =>
            nextSha256LiteralRules.set(sha256, rules.push(rule)))(
            nextSha256LiteralRules.get(sha256) ??
              PersistentList<HashedLiteralPolicyRule>()
          );
        }
      }
    };
    const removeRule = (rule: PolicyRule): void => {
      if (rule.matchType === PolicyRuleMatchType.Glob) {
        nextGlobRules = removeRuleFromMap(nextGlobRules, rule);
      } else if (rule.matchType === PolicyRuleMatchType.Literal) {
        nextLiteralRules = removeRuleFromMap(nextLiteralRules, rule);
      } else {
        const sha256 = rule.hashes["sha256"];
        if (sha256) {
          const rules = (
            nextSha256LiteralRules.get(sha256) ?? PersistentList()
          ).filter(
            (existingRule) =>
              existingRule.sourceEvent.event_id !== rule.sourceEvent.event_id
          );
          if (rules.size === 0) {
            nextSha256LiteralRules = nextSha256LiteralRules.delete(sha256);
          } else {
            nextSha256LiteralRules = nextSha256LiteralRules.set(sha256, rules);
          }
        }
      }
    };
    for (const change of changes) {
      if (
        change.rule.kind !== this.entityType ||
        change.rule.recommendation !== this.recommendation
      ) {
        continue;
      }
      switch (change.changeType) {
        case PolicyRuleChangeType.Added:
        case PolicyRuleChangeType.Modified:
          addRule(change.rule);
          break;
        case PolicyRuleChangeType.RevealedLiteral:
          // We have to only add the rule if we know it is currently valid.. otherwise we could accidentally add a removed rule.
          if (rulesByEventID.has(change.event.event_id)) {
            addRule(change.rule);
          }
          break;
        case PolicyRuleChangeType.Removed:
          removeRule(change.rule);
      }
    }
    return new PolicyRuleScope(
      revision,
      this.entityType,
      this.recommendation,
      nextGlobRules,
      nextLiteralRules,
      nextSha256LiteralRules
    );
  }
  public literalRulesMatchingEntity(entity: string): PolicyRule[] {
    return [...(this.literalRules.get(entity) ?? [])];
  }
  public globRulesMatchingEntity(entity: string): PolicyRule[] {
    return [...this.globRules.values()]
      .filter((rules) => {
        const [firstRule] = rules;
        if (firstRule === undefined) {
          throw new TypeError(
            `The code is wrong and so is my understanding of everything`
          );
        }
        return firstRule.isMatch(entity);
      })
      .map((rules) => [...rules])
      .flat();
  }
  public hashedRulesMatchingEntity(entity: string): PolicyRule[] {
    return [
      ...this.sha256HashedLiteralRules.get(
        Base64.stringify(SHA256(entity)),
        []
      ),
    ];
  }

  allRulesMatchingEntity(
    entity: string,
    searchHashedRules: boolean
  ): PolicyRule[] {
    return [
      ...this.literalRulesMatchingEntity(entity),
      ...this.globRulesMatchingEntity(entity),
      ...(searchHashedRules ? this.hashedRulesMatchingEntity(entity) : []),
    ];
  }
  findRuleMatchingEntity(
    entity: string,
    searchHashedRules: boolean
  ): PolicyRule | undefined {
    const literalRule = this.literalRules.get(entity);
    if (literalRule !== undefined) {
      return literalRule.get(0);
    }
    if (searchHashedRules) {
      const hashedRules = this.sha256HashedLiteralRules.get(
        Base64.stringify(SHA256(entity))
      );
      if (hashedRules !== undefined) {
        return hashedRules.get(0);
      }
    }
    const globRules = this.globRulesMatchingEntity(entity);
    if (globRules.length === 0) {
      return undefined;
    } else {
      return globRules.at(0);
    }
  }

  findHashRules(hash: string): HashedLiteralPolicyRule[] {
    return [...this.sha256HashedLiteralRules.get(hash, [])];
  }
}
