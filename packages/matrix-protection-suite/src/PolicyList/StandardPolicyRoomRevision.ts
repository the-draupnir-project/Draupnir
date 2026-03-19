// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  PolicyRuleEvent,
  PolicyRuleType,
  UnredactedPolicyContent,
  isPolicyTypeObsolete,
  normalisePolicyRuleType,
} from "../MatrixTypes/PolicyEvents";
import {
  EntityMatchOptions,
  MjolnirShortcodeEvent,
  PolicyRoomRevision,
} from "./PolicyListRevision";
import {
  HashedLiteralPolicyRule,
  LiteralPolicyRule,
  PolicyRule,
  PolicyRuleMatchType,
  Recommendation,
  parsePolicyRule,
} from "./PolicyRule";
import { PolicyRuleChange, PolicyRuleChangeType } from "./PolicyRuleChange";
import {
  StateChangeType,
  calculateStateChange,
} from "../StateTracking/StateChangeType";
import { Revision } from "./Revision";
import { Map as PersistentMap, List as PersistentList } from "immutable";
import { Logger } from "../Logging/Logger";
import { PowerLevelsEvent } from "../MatrixTypes/PowerLevels";
import { PowerLevelsMirror } from "../Client/PowerLevelsMirror";
import {
  MatrixRoomID,
  StringEventID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { isError } from "@gnuxie/typescript-result";
import { SHA256 } from "crypto-js";
import Base64 from "crypto-js/enc-base64";

const log = new Logger("StandardPolicyRoomRevision");

/**
 * A map interning rules by their rule type, and then their state key.
 */
type PolicyRuleMap = PersistentMap<
  PolicyRuleType,
  PersistentMap<string, PolicyRule>
>;

/**
 * A map interning rules by their event id.
 */
type PolicyRuleByEventIDMap = PersistentMap<string /* event id */, PolicyRule>;

type PolicyRuleByHashMap = PersistentMap<
  string /* hash */,
  PersistentList<HashedLiteralPolicyRule>
>;

/**
 * A standard implementation of a `PolicyListRevision` using immutable's persistent maps.
 */
export class StandardPolicyRoomRevision implements PolicyRoomRevision {
  /**
   * Use {@link StandardPolicyRoomRevision.blankRevision} to get started.
   * Only use this constructor if you are implementing a variant of PolicyListRevision.
   * @param revisionID A revision ID to represent this revision.
   * @param policyRules A map containing the rules for this revision by state type and then state key.
   * @param policyRuleByEventId A map containing the rules ofr this revision by event id.
   */
  public constructor(
    public readonly room: MatrixRoomID,
    public readonly revisionID: Revision,
    public readonly shortcode: undefined | string,
    /**
     * A map of state events indexed first by state type and then state keys.
     */
    private readonly policyRules: PolicyRuleMap,
    /**
     * Allow us to detect whether we have updated the state for this event.
     */
    private readonly policyRuleByEventId: PolicyRuleByEventIDMap,
    private readonly policyRuleBySHA256: PolicyRuleByHashMap,
    private readonly powerLevelsEvent: PowerLevelsEvent | undefined
  ) {}

  /**
   * @returns An empty revision.
   */
  public static blankRevision(room: MatrixRoomID): StandardPolicyRoomRevision {
    return new StandardPolicyRoomRevision(
      room,
      new Revision(),
      undefined,
      PersistentMap(),
      PersistentMap(),
      PersistentMap(),
      undefined
    );
  }

  public isBlankRevision(): boolean {
    return this.policyRuleByEventId.isEmpty();
  }

  /**
   * Lookup the current rules cached for the list.
   * @param stateType The event type e.g. m.policy.rule.user.
   * @param stateKey The state key e.g. rule:@bad:matrix.org
   * @returns A state event if present or null.
   */
  public getPolicyRule(stateType: PolicyRuleType, stateKey: string) {
    return this.policyRules.get(stateType)?.get(stateKey);
  }

  allRules(): PolicyRule[] {
    return [...this.policyRuleByEventId.values()];
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
    const hash = searchHashedRules ? Base64.stringify(SHA256(entity)) : "";
    return this.allRulesOfType(ruleTypeOf(entity), recommendation).filter(
      (rule) => {
        if (rule.matchType !== PolicyRuleMatchType.HashedLiteral) {
          return rule.isMatch(entity);
        } else {
          if (searchHashedRules) {
            return rule.hashes["sha256"] === hash;
          } else {
            return false;
          }
        }
      }
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
    if (algorithm === "sha256") {
      return [
        ...this.policyRuleBySHA256
          .get(hash, PersistentList<HashedLiteralPolicyRule>())
          .filter(
            (rule) =>
              type === rule.kind &&
              (recommendation === undefined ||
                recommendation === rule.recommendation)
          ),
      ];
    }
    return this.allRulesOfType(type, recommendation).filter((rule) => {
      if (rule.matchType !== PolicyRuleMatchType.HashedLiteral) {
        return false;
      }
      return rule.hashes[algorithm] === hash;
    }) as HashedLiteralPolicyRule[];
  }

  findRuleMatchingEntity(
    entity: string,
    { recommendation, type, searchHashedRules }: EntityMatchOptions
  ): PolicyRule | undefined {
    const hash = searchHashedRules ? Base64.stringify(SHA256(entity)) : "";
    return this.allRulesOfType(type, recommendation).find((rule) => {
      if (rule.matchType !== PolicyRuleMatchType.HashedLiteral) {
        return rule.isMatch(entity);
      } else {
        if (searchHashedRules) {
          return rule.hashes["sha256"] === hash;
        } else {
          return false;
        }
      }
    });
  }

  allRulesOfType(
    type: PolicyRuleType,
    recommendation?: Recommendation
  ): PolicyRule[] {
    const rules: PolicyRule[] = [];
    const stateKeyMap = this.policyRules.get(type);
    if (stateKeyMap) {
      for (const rule of stateKeyMap.values()) {
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
  ): StandardPolicyRoomRevision {
    let nextPolicyRules = this.policyRules;
    let nextPolicyRulesByEventID = this.policyRuleByEventId;
    let nextPolicyRulesBySHA256 = this.policyRuleBySHA256;
    const setPolicyRule = (
      stateType: PolicyRuleType,
      stateKey: string,
      rule: PolicyRule
    ): void => {
      const typeTable = nextPolicyRules.get(stateType) ?? PersistentMap();
      nextPolicyRules = nextPolicyRules.set(
        stateType,
        typeTable.set(stateKey, rule)
      );
      nextPolicyRulesByEventID = nextPolicyRulesByEventID.set(
        rule.sourceEvent.event_id,
        rule
      );
      if (
        rule.matchType === PolicyRuleMatchType.HashedLiteral &&
        rule.hashes["sha256"]
      ) {
        const entry = nextPolicyRulesBySHA256.get(
          rule.hashes["sha256"],
          PersistentList<HashedLiteralPolicyRule>()
        );
        nextPolicyRulesBySHA256.set(rule.hashes["sha256"], entry.push(rule));
      }
    };
    const removePolicyRule = (rule: PolicyRule): void => {
      const typeTable = nextPolicyRules.get(rule.kind);
      if (typeTable === undefined) {
        throw new TypeError(
          `Cannot find a rule for ${rule.sourceEvent.event_id}, this should be impossible`
        );
      }
      nextPolicyRules = nextPolicyRules.set(
        rule.kind,
        typeTable.delete(rule.sourceEvent.state_key)
      );
      nextPolicyRulesByEventID = nextPolicyRulesByEventID.delete(
        rule.sourceEvent.event_id
      );
      if (
        rule.matchType === PolicyRuleMatchType.HashedLiteral &&
        rule.hashes["sha256"]
      ) {
        const entry = nextPolicyRulesBySHA256.get(rule.hashes["sha256"]);
        if (entry !== undefined) {
          const nextEntry = entry.filter(
            (searchRule) =>
              searchRule.sourceEvent.event_id !== rule.sourceEvent.event_id
          );
          if (nextEntry.size === 0) {
            nextPolicyRulesBySHA256 = nextPolicyRulesBySHA256.delete(
              rule.hashes["sha256"]
            );
          } else {
            nextPolicyRulesBySHA256 = nextPolicyRulesBySHA256.set(
              rule.hashes["sha256"],
              nextEntry
            );
          }
        }
      }
    };
    for (const change of changes) {
      switch (change.changeType) {
        case PolicyRuleChangeType.Added:
        case PolicyRuleChangeType.Modified:
          setPolicyRule(
            change.rule.kind,
            change.rule.sourceEvent.state_key,
            change.rule
          );
          break;
        case PolicyRuleChangeType.RevealedLiteral:
          if (this.hasEvent(change.event.event_id)) {
            setPolicyRule(
              change.rule.kind,
              change.rule.sourceEvent.state_key,
              change.rule
            );
          } else {
            // This should only happen if a policy is quickly removed before it can be revealed asynchronously...
            log.error(
              "A RevealedLiteral rule was provided in changes, but we can't find the HashedLiteral rule",
              change.rule
            );
          }
          break;
        case PolicyRuleChangeType.Removed:
          removePolicyRule(change.rule);
          break;
        default:
          throw new TypeError(
            `Unrecognised change type in policy room revision ${change.changeType}`
          );
      }
    }
    return new StandardPolicyRoomRevision(
      this.room,
      new Revision(),
      this.shortcode,
      nextPolicyRules,
      nextPolicyRulesByEventID,
      nextPolicyRulesBySHA256,
      this.powerLevelsEvent
    );
  }
  hasEvent(eventId: string): boolean {
    return this.policyRuleByEventId.has(eventId)
      ? true
      : this.powerLevelsEvent?.event_id === eventId;
  }

  hasPolicy(eventID: StringEventID): boolean {
    return this.hasEvent(eventID);
  }

  getPolicy(eventID: StringEventID): PolicyRule | undefined {
    return this.policyRuleByEventId.get(eventID);
  }

  // FIXME: Ideally this method wouldn't exist, but it has to for now because
  // otherwise there would need to be some way to add a isRedacted predicate
  // to all events added to the decoder.
  // which tbh probably can just be done by having a table with them and
  // if there isn't an entry, it just uses the default.
  // Which is probably safe enough given redaction rules are in the auth rules
  // But then how do you manage differences between room versions?
  // It probably really is more reliable to depend upon unsigned.redacted_because.
  // but i'm not sure. Needs further investigation.
  /**
   * Calculate the changes from this revision with a more recent set of state events.
   * Will only show the difference, if the set is the same then no changes will be returned.
   * @param state The state events that reflect a different revision of the list.
   * @returns Any changes between this revision and the new set of state events.
   */
  public changesFromState(state: PolicyRuleEvent[]): PolicyRuleChange[] {
    const changes: PolicyRuleChange[] = [];
    for (const event of state) {
      const ruleKind = normalisePolicyRuleType(event.type);
      if (ruleKind === PolicyRuleType.Unknown) {
        continue; // this rule is of an invalid or unknown type.
      }
      const existingRule = this.getPolicyRule(ruleKind, event.state_key);
      const existingState = existingRule?.sourceEvent;

      // Now we need to figure out if the current event is of an obsolete type
      // (e.g. org.matrix.mjolnir.rule.user) when compared to the previousState (which might be m.policy.rule.user).
      // We do not want to overwrite a rule of a newer type with an older type even if the event itself is supposedly more recent
      // as it may be someone deleting the older versions of the rules.
      if (existingState) {
        if (isPolicyTypeObsolete(ruleKind, existingState.type, event.type)) {
          log.info(
            "PolicyList",
            `In PolicyList ${this.room.toPermalink()}, conflict between rules ${
              event["event_id"]
            } (with obsolete type ${event["type"]}) ` +
              `and ${existingState.event_id} (with standard type ${existingState["type"]}). Ignoring rule with obsolete type.`
          );
          continue;
        }
      }
      const changeType = calculateStateChange(event, existingState);
      switch (changeType) {
        case StateChangeType.NoChange:
        case StateChangeType.BlankedEmptyContent:
        case StateChangeType.IntroducedAsBlank:
          continue;
        case StateChangeType.CompletelyRedacted:
        case StateChangeType.BlankedContent: {
          if (existingRule === undefined) {
            continue; // we have already removed the rule somehow.
          }
          // remove the rule.
          const redactedBecause = event.unsigned?.redacted_because;
          const sender =
            typeof redactedBecause === "object" &&
            redactedBecause !== null &&
            "sender" in redactedBecause &&
            typeof redactedBecause.sender === "string"
              ? redactedBecause.sender
              : event.sender;
          changes.push({
            changeType: PolicyRuleChangeType.Removed,
            event,
            sender,
            rule: existingRule,
            previousRule: existingRule,
            ...(existingState ? { existingState } : {}),
          });
          // Event has no content and cannot be parsed as a ListRule.
          continue;
        }
        case StateChangeType.Introduced:
        case StateChangeType.Reintroduced:
        case StateChangeType.SupersededContent: {
          // This cast is required because for some reason TS won't narrow on the
          // properties of `event`.
          // We should really consider making all of the properties in MatrixTypes
          // readonly.
          const ruleParseResult = parsePolicyRule(
            event as Omit<PolicyRuleEvent, "content"> & {
              content: UnredactedPolicyContent;
            }
          );
          if (isError(ruleParseResult)) {
            log.error("Unable to parse a policy rule", ruleParseResult.error);
            continue;
          }
          changes.push({
            rule: ruleParseResult.ok,
            changeType:
              changeType === StateChangeType.SupersededContent
                ? PolicyRuleChangeType.Modified
                : PolicyRuleChangeType.Added,
            event,
            sender: event.sender,
            ...(existingState ? { existingState } : {}),
            ...(existingRule ? { previousRule: existingRule } : {}),
          });
          continue;
        }
        case StateChangeType.PartiallyRedacted:
          throw new TypeError(
            `No idea how the hell there is a partially redacted policy rule`
          );
        default:
          throw new TypeError(`Unrecognised state change type ${changeType}`);
      }
    }
    return changes;
  }

  public changesFromRevealedPolicies(
    policies: LiteralPolicyRule[]
  ): PolicyRuleChange[] {
    const changes: PolicyRuleChange[] = [];
    for (const policy of policies) {
      if (policy.sourceEvent.room_id !== this.room.toRoomIDOrAlias()) {
        continue; // not for this list
      }
      const entry = this.policyRuleByEventId.get(policy.sourceEvent.event_id);
      if (entry === undefined) {
        log.error(
          "We've been provided a revealed literal for a policy that is no longer interned",
          policy
        );
        continue;
      }
      if (entry.isReversedFromHashedPolicy) {
        continue; // already interned
      }
      changes.push({
        changeType: PolicyRuleChangeType.RevealedLiteral,
        event: policy.sourceEvent,
        sender: policy.sourceEvent.sender,
        rule: policy,
      });
    }
    return changes;
  }

  public reviseFromState(policyState: PolicyRuleEvent[]): PolicyRoomRevision {
    const changes = this.changesFromState(policyState);
    return this.reviseFromChanges(changes);
  }

  public isAbleToEdit(who: StringUserID, policy: PolicyRuleType): boolean {
    const powerLevelsContent = this.powerLevelsEvent?.content;
    return PowerLevelsMirror.isUserAbleToSendState(
      who,
      policy,
      powerLevelsContent
    );
  }

  public reviseFromPowerLevels(
    powerLevels: PowerLevelsEvent
  ): PolicyRoomRevision {
    return new StandardPolicyRoomRevision(
      this.room,
      new Revision(),
      this.shortcode,
      this.policyRules,
      this.policyRuleByEventId,
      this.policyRuleBySHA256,
      powerLevels
    );
  }
  public reviseFromShortcode(event: MjolnirShortcodeEvent): PolicyRoomRevision {
    return new StandardPolicyRoomRevision(
      this.room,
      new Revision(),
      event.content.shortcode,
      this.policyRules,
      this.policyRuleByEventId,
      this.policyRuleBySHA256,
      this.powerLevelsEvent
    );
  }
}
