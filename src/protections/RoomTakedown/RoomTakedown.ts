// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  LiteralPolicyRule,
  Logger,
  PolicyListRevision,
  PolicyRuleChange,
  PolicyRuleMatchType,
  PolicyRuleType,
  Recommendation,
  SHA256RoomHashStore,
  SimpleChangeType,
} from "matrix-protection-suite";
import { RoomAuditLog } from "./RoomAuditLog";
import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";

const log = new Logger("RoomTakedown");

type RoomTakedown = {
  handleDiscoveredRooms(rooms: StringRoomID[]): Promise<Result<void>>;
  handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<Result<void>>;
};

export type RoomTakedowner = {
  isRoomTakendown(roomID: StringRoomID): Promise<Result<boolean>>;
  takedownRoom(roomID: StringRoomID): Promise<Result<void>>;
};


// FIXME: I don't like this, this should be done via the capabilities system
//        surely?
/**
 * For e.g. reporting takedowns to the management room.
 * ah shit aren't you forgetting about capabilities? yeah i am at the moment.
 */
export type RoomTakedownUXLog = {
  handleTakedownResult(result: Result<unknown>, policy: LiteralPolicyRule): void;
}

// FIXME:
// the interface needs changing so that it is void, and the way tests check and
// the way you render messages is through yet antoher interface that gets
// passed key results.

// FIXME:
// This service probably needs to be responsible for instantiating the room audit
// log and serving as a singleton.

// FIXME:
// we still do nothing when the service is started.

/**
 * This exists as the main handler for reacting to literal room policies
 * (that have been reversed from hashed policies elsewhere) AND
 * moving discovered rooms into the hashStore. Although it's not clear
 * whether we need to do that?
 */
export class StandardRoomTakedown implements RoomTakedown {
  public constructor(
    private readonly hashStore: SHA256RoomHashStore,
    private readonly auditLog: RoomAuditLog,
    private readonly takedowner: RoomTakedowner,
    private readonly uxLog: RoomTakedownUXLog,
  ) {
    // nothing to do
  }
  public async handleDiscoveredRooms(
    rooms: StringRoomID[]
  ): Promise<Result<void>> {
    return (await this.hashStore.storeUndiscoveredRooms(rooms)) as Result<void>;
  }

  private async takedownRoom(
    roomID: StringRoomID,
    rule: LiteralPolicyRule
  ): Promise<Result<void>> {
    const isRoomTakendownResult = await this.takedowner.isRoomTakendown(roomID);
    if (isError(isRoomTakendownResult)) {
      return isRoomTakendownResult;
    }
    if (isRoomTakendownResult.ok) {
      return ResultError.Result(
        `The room ${roomID} has already been takendown according to your homeserver`
      );
    }
    const takedownResult = await this.takedowner.takedownRoom(roomID);
    if (isError(takedownResult)) {
      return takedownResult;
    } else {
      return await this.auditLog.takedownRoom(rule);
    }
  }

  public async handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<Result<void>> {
    const roomsToTakedown: LiteralPolicyRule[] = [];
    for (const change of changes) {
      if (
        change.changeType === SimpleChangeType.Added &&
        change.rule.kind === PolicyRuleType.Room &&
        change.rule.matchType === PolicyRuleMatchType.Literal &&
        change.rule.recommendation === Recommendation.Takedown
      ) {
        if (
          !this.auditLog.isRoomTakendown(change.rule.entity as StringRoomID)
        ) {
          roomsToTakedown.push(change.rule);
        }
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
      this.uxLog.handleTakedownResult(takedownResult, policy);
    }
    return Ok(undefined);
  }
}
