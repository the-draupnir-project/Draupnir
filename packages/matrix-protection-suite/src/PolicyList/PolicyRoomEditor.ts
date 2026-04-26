// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  MatrixRoomID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../Interface/Action";
import { PolicyRuleType } from "../MatrixTypes/PolicyEvents";
import { PolicyRule, Recommendation } from "./PolicyRule";

export type TakedownPolicyOption = {
  /** Whether the policy should be hashed, default to true */
  shouldHash?: boolean | undefined;
};

/**
 * An interface for editing the policies in a PolicyRoom.
 */
export interface PolicyRoomEditor {
  readonly room: MatrixRoomID;
  /**
   * Create a policy in the Matrix room.
   * @param entityType The `PolicyRuleType` for the policy.
   * @param recommendation The recommendation for the policy rule.
   * @param entity The entity that is the subject of the rule.
   * @param reason A reason for the policy being created.
   * @param additionalProperties Any other properties that should be embedded in
   * the content of the rule.
   * @returns An `ActionResult` with the event ID of the newly created policy.
   * @see {@link PolicyRuleType}
   * @see {@link Recommendation}
   */
  createPolicy(
    entityType: PolicyRuleType,
    recommendation: Recommendation,
    entity: string,
    reason: string,
    additionalProperties: Record<string, unknown>
  ): Promise<ActionResult<string /** The event ID of the new policy. */>>;
  /**
   * A lower level utility to remove a single policy rule.
   * The other methods usually remove all rules by entity,
   * whereas this one will just remove the relevant rules by state_key (current and legacy).
   */
  removePolicyByStateKey(
    ruleType: PolicyRuleType,
    stateKey: string
  ): Promise<ActionResult<void>>;
  /**
   * Remove a policy enacted upon an entity from the Matrix room.
   * Necessary because each `PolicyRuleType` and `Recommendation` can have
   * several variants from historical code.
   * @param ruleType The `PolicyRuleType` for the enacted policy.
   * @param recommendation The `Recommendation` for the enacted policy,
   * @param entity The entity that is the subject of the policy.
   * @param reason The reason for the removal of the policy.
   * @returns An `ActionResult` with the `PolicyRule`s that were removed.
   * @see {@link PolicyRuleType}
   * @see {@link Recommendation}
   */
  removePolicy(
    ruleType: PolicyRuleType,
    recommendation: Recommendation,
    entity: string,
    reason?: string
  ): Promise<ActionResult<PolicyRule[]>>;
  /**
   * Create a policy rule with the recommendation to ban the entity.
   * @param ruleType The `PolicyRuleType` for the entity.
   * @param entity The subject of the policy.
   * @param reason The reason why the entity will be banned.
   * @returns The event ID for the newly created policy rule.
   */
  banEntity(
    ruleType: PolicyRuleType,
    entity: string,
    reason?: string
  ): Promise<ActionResult<string>>;
  takedownEntity(
    ruleType: PolicyRuleType,
    entity: string,
    options: TakedownPolicyOption
  ): Promise<ActionResult<StringEventID>>;
  /**
   * Unban an entity that has a policy with the ban recommendation enacted against it.
   * @param ruleType The `PolicyRuleType` relevant to the entity.
   * @param entity The subject of the enacted ban.
   * @returns The `PolicyRule`s that were enacting a ban against the entity.
   */
  unbanEntity(
    ruleType: PolicyRuleType,
    entity: string
  ): Promise<ActionResult<PolicyRule[]>>;
}
