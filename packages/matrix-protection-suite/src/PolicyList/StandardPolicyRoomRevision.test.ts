// SPDX-FileCopyrightText: 2026 Catlan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { PolicyRuleType } from "../MatrixTypes/PolicyEvents";
import { describeRoom } from "../StateTracking/DeclareRoomState";
import { randomUserID } from "../TestUtilities/EventGeneration";
import { PolicyRuleChangeType } from "./PolicyRuleChange";

test("allRules and allRulesOfType filter out expired rules", function () {
  const expiredUser = randomUserID();
  const permanentUser = randomUserID();
  const { policyRevisionIssuer } = describeRoom({
    policyDescriptions: [
      {
        entity: expiredUser,
        type: PolicyRuleType.User,
        expiry: Date.now() - 1000,
      },
      {
        entity: permanentUser,
        type: PolicyRuleType.User,
      },
    ],
  });
  const revision = policyRevisionIssuer.currentRevision;
  expect(revision.allRules()).toHaveLength(1);
  const rule = revision.allRules()[0];
  if (rule === undefined || !("entity" in rule)) {
    throw new TypeError("Expected a literal policy rule with an entity");
  }
  expect(rule.entity).toBe(permanentUser);
  expect(revision.allRulesOfType(PolicyRuleType.User)).toHaveLength(1);
});

test("changesFromExpiry produces a Removed change for expired rules only", function () {
  const expiredUser = randomUserID();
  const permanentUser = randomUserID();
  const expiryTimestamp = Date.now() - 1000;
  const { policyRevisionIssuer } = describeRoom({
    policyDescriptions: [
      {
        entity: expiredUser,
        type: PolicyRuleType.User,
        expiry: expiryTimestamp,
      },
      {
        entity: permanentUser,
        type: PolicyRuleType.User,
      },
    ],
  });
  const revision = policyRevisionIssuer.currentRevision;
  const changes = revision.changesFromExpiry(Date.now());
  expect(changes).toHaveLength(1);
  const change = changes[0];
  if (change === undefined || !("entity" in change.rule)) {
    throw new TypeError("Expected a Removed change for a literal policy rule");
  }
  expect(change.changeType).toBe(PolicyRuleChangeType.Removed);
  expect(change.rule.entity).toBe(expiredUser);
});

test("nextExpiringTimestamp returns the soonest expiry among non-expired rules", function () {
  const now = Date.now();
  const soonUser = randomUserID();
  const laterUser = randomUserID();
  const { policyRevisionIssuer } = describeRoom({
    policyDescriptions: [
      {
        entity: soonUser,
        type: PolicyRuleType.User,
        expiry: now + 1000,
      },
      {
        entity: laterUser,
        type: PolicyRuleType.User,
        expiry: now + 5000,
      },
    ],
  });
  const revision = policyRevisionIssuer.currentRevision;
  expect(revision.nextExpiringTimestamp()).toBe(now + 1000);
});

test("nextExpiringTimestamp is undefined when there are no expiring rules", function () {
  const { policyRevisionIssuer } = describeRoom({
    policyDescriptions: [
      {
        entity: randomUserID(),
        type: PolicyRuleType.User,
      },
    ],
  });
  expect(
    policyRevisionIssuer.currentRevision.nextExpiringTimestamp()
  ).toBeUndefined();
});
