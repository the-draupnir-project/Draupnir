// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { StaticDecode, Type } from "@sinclair/typebox";
import { PolicyRuleEvent, PolicyRuleType } from "../MatrixTypes/PolicyEvents";
import { PowerLevelsEvent } from "../MatrixTypes/PowerLevels";
import {
  HashedLiteralPolicyRule,
  LiteralPolicyRule,
  PolicyRule,
  Recommendation,
} from "./PolicyRule";
import { PolicyRuleChange } from "./PolicyRuleChange";
import { Revision } from "./Revision";
import { StateEvent } from "../MatrixTypes/Events";
import {
  MatrixRoomID,
  StringEventID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

/** MSC3784 support. Please note that policy lists predate room types. So there will be lists in the wild without this type. */
export const POLICY_ROOM_TYPE = "support.feline.policy.lists.msc.v1";
export const POLICY_ROOM_TYPE_VARIANTS = [POLICY_ROOM_TYPE];
export const MJOLNIR_SHORTCODE_EVENT_TYPE = "org.matrix.mjolnir.shortcode";

export type MjolnirShortcodeEventContent = StaticDecode<
  typeof MjolnirShortcodeEventContent
>;
export const MjolnirShortcodeEventContent = Type.Object({
  shortcode: Type.Optional(Type.String()),
});

export type MjolnirShortcodeEvent = StaticDecode<typeof MjolnirShortcodeEvent>;
export const MjolnirShortcodeEvent = StateEvent(MjolnirShortcodeEventContent);

export type EntityMatchOptions = {
  type: PolicyRuleType;
  recommendation: Recommendation;
  searchHashedRules: boolean;
};

/**
 * An interface for reading rules from a `PolicyListRevision`.
 */
export interface PolicyListRevisionView {
  /**
   * @returns all of the rules enacted by the policy list.
   */
  allRules(): PolicyRule[];
  /**
   * @param entity The entity that is being queried.
   * @param type Restrict the search to only rules of this `PolicyRuleType`.
   * @param recommendation The recommendation for the rule.
   * @returns The rules that are enacted against the entity in the policy list.
   */
  allRulesMatchingEntity(
    entity: string,
    options: Partial<EntityMatchOptions>
  ): PolicyRule[];
  /**
   * @param type The PolicyRuleType to restrict the rules to.
   * @param recommendation A recommendation to also restrict the rules to.
   */
  allRulesOfType(
    type: PolicyRuleType,
    recommendation?: Recommendation
  ): PolicyRule[];
  /**
   * Find the first rule that matches the entity.
   * @param entity The entity to search a rule for.
   * @param type The rule type for the entity.
   * @param recommendation The recommendation that we are looking for.
   */
  findRuleMatchingEntity(
    entity: string,
    options: EntityMatchOptions
  ): PolicyRule | undefined;
  /**
   * Is this the first revision that has been issued?
   */
  isBlankRevision(): boolean;

  hasPolicy(eventID: StringEventID): boolean;
  getPolicy(eventID: StringEventID): PolicyRule | undefined;

  findRulesMatchingHash(
    hash: string,
    algorithm: string,
    options: Partial<Pick<EntityMatchOptions, "recommendation">> &
      Pick<EntityMatchOptions, "type">
  ): HashedLiteralPolicyRule[];
}

/**
 * A revision is a view of a PolicyList at a given moment in the list's history.
 * This may even be a representation of multiple lists aggregated together.
 */
export interface PolicyListRevision extends PolicyListRevisionView {
  readonly revisionID: Revision;
  /**
   * Create a new revision from a series of `PolicyRuleChange`'s
   * @param changes The changes to use as a basis for a new revision.
   * @returns A new `PolicyListRevision`.
   */
  reviseFromChanges(changes: PolicyRuleChange[]): PolicyListRevision;
}

/**
 * A revision of a PolicyRoom at a given moment in the room's history.
 */
export interface PolicyRoomRevision extends PolicyListRevision {
  readonly room: MatrixRoomID;
  /**
   * A shortcode that Mjolnir has associated wit the room.
   */
  readonly shortcode: string | undefined;
  reviseFromChanges(changes: PolicyRuleChange[]): PolicyRoomRevision;
  /**
   * Create a new revision from the state of the associated Matrix room.
   * @param policyState The state from the matrix room, obtained from `/state`.
   * @returns A new PolicyRoomRevision.
   */
  reviseFromState(policyState: PolicyRuleEvent[]): PolicyRoomRevision;
  /**
   * Calculate the changes to `PolicyRule`s contained in this revision based
   * on new room state.
   * @param state State events from /state.
   * @returns A list of changes to `PolicyRule`s.
   */
  changesFromState(state: PolicyRuleEvent[]): PolicyRuleChange[];
  /**
   * Calculate the changes to `PolicyRule`'s contained within the revision based
   * on hashed policy rules that have been reversed.
   */
  changesFromRevealedPolicies(
    policies: LiteralPolicyRule[]
  ): PolicyRuleChange[];
  /**
   * Check whether the list has a rule associated with this event.
   * @param eventId The id of a policy rule event.
   * @returns true if the revision contains a rule associated with the event.
   */
  hasEvent(eventId: string): boolean;
  /**
   * Check whether a user can edit a policy.
   * @param who Who is wanting to edit a policy.
   * @param policy The `PolicyRuleType` that is going to be modified.
   */
  isAbleToEdit(who: StringUserID, policy: PolicyRuleType): boolean;
  reviseFromPowerLevels(powerLevels: PowerLevelsEvent): PolicyRoomRevision;
  reviseFromShortcode(event: MjolnirShortcodeEvent): PolicyRoomRevision;
}
