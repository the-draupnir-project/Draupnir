// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { createMock } from "ts-auto-mock";
import { StandardRoomTakedown } from "../../../src/protections/RoomTakedown/RoomTakedown";
import {
  describePolicyRule,
  describeProtectedRoomsSet,
  Ok,
  parsePolicyRule,
  PolicyRuleChangeType,
  PolicyRuleType,
  randomRoomID,
  Recommendation,
  StandardPolicyListRevision,
} from "matrix-protection-suite";
import { RoomAuditLog } from "../../../src/protections/RoomTakedown/RoomAuditLog";
import { RoomTakedownCapability } from "../../../src/capabilities/RoomTakedownCapability";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import expect from "expect";
import { SqliteHashReversalStore } from "../../../src/backingstore/better-sqlite3/HashStore";
import { makeStore } from "../stores/hashStoreTest";

function makeServiceMocks(): {
  auditLogItems: Parameters<RoomAuditLog["takedownRoom"]>[];
  auditLog: RoomAuditLog;
  hashStore: SqliteHashReversalStore;
  takedownCapabilityItems: StringRoomID[];
  takedownCapability: RoomTakedownCapability;
} {
  const auditLogItems: Parameters<RoomAuditLog["takedownRoom"]>[] = [];
  const takedownCapabilityItems: StringRoomID[] = [];
  return {
    auditLogItems,
    auditLog: createMock<RoomAuditLog>({
      async takedownRoom(...args: Parameters<RoomAuditLog["takedownRoom"]>) {
        auditLogItems.push(args);
        return Ok(undefined);
      },
    }),
    takedownCapabilityItems,
    takedownCapability: createMock<RoomTakedownCapability>({
      async takedownRoom(roomID: StringRoomID) {
        takedownCapabilityItems.push(roomID);
        return Ok({
          room_id: roomID,
        });
      },
      async isRoomTakendown(_roomID) {
        return Ok(false);
      },
    }),
    hashStore: makeStore(),
  };
}

describe("", function () {
  it("Test rooms are takendown when policies are added", async function () {
    const policyRoom = randomRoomID([]);
    const bannedRoom = randomRoomID([]);
    const policy = parsePolicyRule(
      describePolicyRule({
        room_id: policyRoom.toRoomIDOrAlias(),
        entity: bannedRoom.toRoomIDOrAlias(),
        reason: "spam",
        recommendation: Recommendation.Takedown,
        type: PolicyRuleType.Room,
      }) as never
    ).expect("Should be able to parse the policy rule.");
    const {
      auditLog,
      takedownCapability,
      auditLogItems,
      takedownCapabilityItems,
      hashStore,
    } = makeServiceMocks();
    const takedownService = new StandardRoomTakedown(
      auditLog,
      hashStore,
      takedownCapability,
      []
    );
    // we give a blank revision because i haven't updated the describeProtectedRoomsSet code
    // to use hashed policies... although thinking about it we don't use them here either lol
    (
      await takedownService.handlePolicyChange(
        StandardPolicyListRevision.blankRevision(),
        [
          {
            changeType: PolicyRuleChangeType.Added,
            rule: policy,
            event: policy.sourceEvent,
            sender: policy.sourceEvent.sender,
          },
        ]
      )
    ).expect("Should have run just fine");
    expect(auditLogItems.length).toBe(1);
    expect(takedownCapabilityItems.length).toBe(1);
  });
  it("Test rooms are takendown at startup", async function () {
    const policyRoom = randomRoomID([]);
    const { protectedRoomsSet } = await describeProtectedRoomsSet({
      lists: [
        {
          room: policyRoom,
          policyDescriptions: [
            {
              entity: randomRoomID([]).toRoomIDOrAlias(),
              recommendation: Recommendation.Takedown,
              type: PolicyRuleType.Room,
            },
            {
              entity: randomRoomID([]).toRoomIDOrAlias(),
              recommendation: Recommendation.Takedown,
              type: PolicyRuleType.Room,
            },
          ],
        },
      ],
    });
    const {
      auditLog,
      takedownCapability,
      auditLogItems,
      takedownCapabilityItems,
      hashStore,
    } = makeServiceMocks();
    const takedownService = new StandardRoomTakedown(
      auditLog,
      hashStore,
      takedownCapability,
      []
    );
    (
      await takedownService.checkAllRooms(
        protectedRoomsSet.watchedPolicyRooms.currentRevision
      )
    ).expect("Should be able to check all rooms");
    expect(auditLogItems.length).toBe(2);
    expect(takedownCapabilityItems.length).toBe(2);
  });
});
