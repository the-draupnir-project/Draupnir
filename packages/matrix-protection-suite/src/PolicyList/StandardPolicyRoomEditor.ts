// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { SHA256 } from "crypto-js";
import Base64 from "crypto-js/enc-base64";
import { RoomStateRevisionIssuer } from "../StateTracking/StateRevisionIssuer";
import { RoomStateEventSender } from "../Client/RoomStateEventSender";
import { PolicyListRevisionIssuer } from "./PolicyListRevisionIssuer";
import { PolicyRoomEditor, TakedownPolicyOption } from "./PolicyRoomEditor";
import {
  PolicyRuleType,
  variantsForPolicyRuleType,
} from "../MatrixTypes/PolicyEvents";
import { PolicyRule, Recommendation } from "./PolicyRule";
import { ActionResult, Ok, isError } from "../Interface/Action";
import {
  MatrixRoomID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";

export class StandardPolicyRoomEditor implements PolicyRoomEditor {
  constructor(
    public readonly room: MatrixRoomID,
    private readonly policyRevisionIssuer: PolicyListRevisionIssuer,
    private readonly roomStateRevisionIssuer: RoomStateRevisionIssuer,
    private readonly roomStateEventSender: RoomStateEventSender
  ) {
    // nothing to do.
  }
  public async removePolicyByStateKey(
    ruleType: PolicyRuleType,
    stateKey: string
  ): Promise<ActionResult<void>> {
    const eventTypesToCheck = variantsForPolicyRuleType(ruleType);
    const sendNullState = async (
      stateType: string,
      stateKey: string
    ): Promise<ActionResult<void>> => {
      const sendResult = await this.roomStateEventSender.sendStateEvent(
        this.room.toRoomIDOrAlias(),
        stateType,
        stateKey,
        {}
      );
      if (isError(sendResult)) {
        return sendResult.elaborate(
          `Could not remove the policy rule with the type ${ruleType} and state key ${stateKey}`
        );
      }
      return Ok(undefined);
    };
    const typesToRemoveResults = eventTypesToCheck
      .map(
        (stateType) =>
          this.roomStateRevisionIssuer.currentRevision.getStateEvent(
            stateType,
            stateKey
          )?.type
      )
      .filter((stateType): stateType is string => stateType !== undefined);
    if (typesToRemoveResults.length === 0) {
      return Ok(undefined);
    }
    for (const stateType of typesToRemoveResults) {
      const nullResult = await sendNullState(stateType, stateKey);
      if (isError(nullResult)) {
        return nullResult;
      }
    }
    return Ok(undefined);
  }
  public async createPolicy(
    entityType: PolicyRuleType,
    recommendation: Recommendation,
    entity: string,
    reason: string,
    additionalProperties: Record<string, unknown>
  ): Promise<ActionResult<string>> {
    const stateKey = Base64.stringify(SHA256(entity + recommendation));
    const sendResult = await this.roomStateEventSender.sendStateEvent(
      this.room.toRoomIDOrAlias(),
      entityType,
      stateKey,
      {
        recommendation,
        entity,
        reason,
        ...additionalProperties,
      }
    );
    if (isError(sendResult)) {
      return sendResult.elaborate(
        `Failed to create a policy for the entity ${entity} with the recommendation ${recommendation} in ${this.room.toPermalink()}`
      );
    }
    return sendResult;
  }
  public async removePolicy(
    ruleType: PolicyRuleType,
    recommendation: Recommendation,
    entity: string,
    _reason?: string
  ): Promise<ActionResult<PolicyRule[]>> {
    const eventTypesToCheck = variantsForPolicyRuleType(ruleType);
    const sendNullState = async (
      stateType: string,
      stateKey: string
    ): Promise<ActionResult<void>> => {
      const sendResult = await this.roomStateEventSender.sendStateEvent(
        this.room.toRoomIDOrAlias(),
        stateType,
        stateKey,
        {}
      );
      if (isError(sendResult)) {
        return sendResult.elaborate(
          `Could not remove the policy rule ${ruleType} for entity ${entity} with recommendation ${recommendation}.`
        );
      }
      return Ok(undefined);
    };

    const currentRevision = this.roomStateRevisionIssuer.currentRevision;
    // We also have to remove any legacy versions of the same policy, such as
    // those created with the type org.matrix.mjolnir.*
    const removeRule = async (
      rule: PolicyRule
    ): Promise<ActionResult<void>> => {
      const stateKey = rule.sourceEvent.state_key;
      const typesToRemoveResults = eventTypesToCheck
        .map(
          (stateType) =>
            currentRevision.getStateEvent(stateType, stateKey)?.type
        )
        .filter((stateType): stateType is string => stateType !== undefined);
      if (typesToRemoveResults.length === 0) {
        return Ok(undefined);
      }
      const removalResults = await Promise.all(
        typesToRemoveResults.map((stateType) => {
          return sendNullState(stateType, stateKey);
        })
      );
      const removalErrors = removalResults.filter(isError);
      const error = removalErrors[0];
      if (error !== undefined) {
        return error;
      } else {
        return Ok(undefined);
      }
    };
    const rules =
      this.policyRevisionIssuer.currentRevision.allRulesMatchingEntity(entity, {
        type: ruleType,
        searchHashedRules: true,
      });
    const removalErrors = (await Promise.all(rules.map(removeRule))).filter(
      isError
    );
    const error = removalErrors[0];
    if (error !== undefined) {
      return error;
    } else {
      return Ok(rules);
    }
  }
  public async banEntity(
    ruleType: PolicyRuleType,
    entity: string,
    reason?: string
  ): Promise<ActionResult<string>> {
    return await this.createPolicy(
      ruleType,
      Recommendation.Ban,
      entity,
      reason ?? "<no reason supplied>",
      {}
    );
  }
  public async takedownEntity(
    ruleType: PolicyRuleType,
    entity: string,
    options: TakedownPolicyOption
  ): Promise<ActionResult<StringEventID>> {
    const recommendation = Recommendation.Takedown;
    const stateKey = Base64.stringify(SHA256(entity + recommendation));
    const sendResult = await this.roomStateEventSender.sendStateEvent(
      this.room.toRoomIDOrAlias(),
      ruleType,
      stateKey,
      {
        recommendation,
        ...(options.shouldHash
          ? {
              ["org.matrix.msc4205.hashes"]: {
                sha256: Base64.stringify(SHA256(entity)),
              },
            }
          : { entity }),
      }
    );
    if (isError(sendResult)) {
      return sendResult.elaborate(
        `Failed to create a policy for the entity ${entity} with the recommendation ${recommendation} in ${this.room.toPermalink()}`
      );
    }
    return sendResult;
  }
  public async unbanEntity(
    ruleType: PolicyRuleType,
    entity: string
  ): Promise<ActionResult<PolicyRule[]>> {
    return await this.removePolicy(ruleType, Recommendation.Ban, entity);
  }
}
