// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  LiteralPolicyRule,
  Logger,
  PolicyListRevision,
  PolicyRuleChange,
  PolicyRuleChangeType,
  PolicyRuleMatchType,
  PolicyRuleType,
  Recommendation,
} from "matrix-protection-suite";
import { RoomAuditLog } from "./RoomAuditLog";
import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { RoomTakedownCapability } from "../../capabilities/RoomTakedownCapability";

const log = new Logger("RoomTakedown");

// FIXME: How can we segment this so that rooms are takendown on prompt in
// the absence of policy approval?
// Probably by using a simulated capability that asks to confirm and then
// does the takedown for real?
// Probably by using an updated version of the shutdown command...
// Ok no that all sucks we'll have to wait for policy approval...

export type RoomTakedownService = {
  handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<Result<void>>;
  checkAllRooms(revision: PolicyListRevision): Promise<Result<void>>;
};

/**
 * This exists as the main handler for reacting to literal room policies
 * (that have been reversed from hashed policies elsewhere) AND
 * moving discovered rooms into the hashStore. Although it's not clear
 * whether we need to do that?
 */
export class StandardRoomTakedown implements RoomTakedownService {
  public constructor(
    private readonly auditLog: RoomAuditLog,
    private readonly takedownCapability: RoomTakedownCapability
  ) {
    // nothing to do
  }

  private async takedownRoom(
    roomID: StringRoomID,
    rule: LiteralPolicyRule
  ): Promise<Result<void>> {
    const isRoomTakendownResult =
      await this.takedownCapability.isRoomTakendown(roomID);
    if (isError(isRoomTakendownResult)) {
      return isRoomTakendownResult;
    }
    if (isRoomTakendownResult.ok) {
      return ResultError.Result(
        `The room ${roomID} has already been takendown according to your homeserver`
      );
    }
    const detailsResult = await this.takedownCapability.getRoomDetails(roomID);
    const takedownResult = await this.takedownCapability.takedownRoom(roomID);
    if (isError(takedownResult)) {
      return takedownResult;
    }
    // Only audit the takedown if the capability is not simulated.
    if (this.takedownCapability.isSimulated) {
      return Ok(undefined);
    }
    const details = (() => {
      if (isError(detailsResult)) {
        log.error(
          "Unable to fetch details for room before takedown",
          roomID,
          detailsResult.error
        );
        return { room_id: roomID };
      } else {
        return detailsResult.ok;
      }
    })();
    return await this.auditLog.takedownRoom(rule, details);
  }

  public async handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<Result<void>> {
    const roomsToTakedown: LiteralPolicyRule[] = [];
    for (const change of changes) {
      if (
        change.rule.kind === PolicyRuleType.Room &&
        change.changeType !== PolicyRuleChangeType.Removed &&
        change.rule.matchType === PolicyRuleMatchType.Literal &&
        change.rule.recommendation === Recommendation.Takedown
      ) {
        roomsToTakedown.push(change.rule);
      }
    }
    for (const policy of roomsToTakedown) {
      const takedownResult = await this.takedownRoom(
        policy.entity as StringRoomID,
        policy
      );
      if (isError(takedownResult)) {
        log.error(
          "Error while trying to takedown the room:",
          policy.entity,
          takedownResult.error
        );
      }
    }
    return Ok(undefined);
  }

  public async checkAllRooms(
    revision: PolicyListRevision
  ): Promise<Result<void>> {
    const roomPolicies = revision
      .allRulesOfType(PolicyRuleType.Room, Recommendation.Takedown)
      .filter((policy) => policy.matchType === PolicyRuleMatchType.Literal);
    for (const policy of roomPolicies) {
      if (this.auditLog.isRoomTakendown(policy.entity as StringRoomID)) {
        continue; // room already takendown
      }
      const takedownResult = await this.takedownRoom(
        policy.entity as StringRoomID,
        policy
      );
      if (isError(takedownResult)) {
        log.error(
          "Error while trying to takedown the room:",
          policy.entity,
          takedownResult.error
        );
      }
    }
    return Ok(undefined);
  }
}
