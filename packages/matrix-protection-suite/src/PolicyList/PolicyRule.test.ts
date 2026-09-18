// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { isError } from "../Interface/Action";
import { UnredactedPolicyContent } from "../MatrixTypes/PolicyEvents";
import { makePolicyRuleUserEvent } from "../TestUtilities/EventGeneration";
import { isExpired, parsePolicyRule } from "./PolicyRule";

test("parsePolicyRule reads the stable expiry key", function () {
  const event = makePolicyRuleUserEvent({ expiry: 123456789 });
  const result = parsePolicyRule(
    event as typeof event & { content: UnredactedPolicyContent }
  );
  if (isError(result)) {
    throw new TypeError("Should be able to parse the policy rule");
  }
  expect(result.ok.expiry).toBe(123456789);
});

test("parsePolicyRule reads the unstable expiry prefix", function () {
  const event = makePolicyRuleUserEvent({});
  const eventWithUnstableExpiry = {
    ...event,
    content: {
      ...event.content,
      "support.feline.policy.expiry.rev.2": 123456789,
    },
  };
  const result = parsePolicyRule(
    eventWithUnstableExpiry as typeof event & {
      content: UnredactedPolicyContent;
    }
  );
  if (isError(result)) {
    throw new TypeError("Should be able to parse the policy rule");
  }
  expect(result.ok.expiry).toBe(123456789);
});

test("The stable expiry key takes precedence over the unstable prefix", function () {
  const event = makePolicyRuleUserEvent({ expiry: 111 });
  const eventWithBothKeys = {
    ...event,
    content: {
      ...event.content,
      "support.feline.policy.expiry.rev.2": 222,
    },
  };
  const result = parsePolicyRule(
    eventWithBothKeys as typeof event & { content: UnredactedPolicyContent }
  );
  if (isError(result)) {
    throw new TypeError("Should be able to parse the policy rule");
  }
  expect(result.ok.expiry).toBe(111);
});

test("An expiry of 0 is treated as permanent (undefined)", function () {
  const event = makePolicyRuleUserEvent({ expiry: 0 });
  const result = parsePolicyRule(
    event as typeof event & { content: UnredactedPolicyContent }
  );
  if (isError(result)) {
    throw new TypeError("Should be able to parse the policy rule");
  }
  expect(result.ok.expiry).toBeUndefined();
});

test("A rule with no expiry is permanent (undefined)", function () {
  const event = makePolicyRuleUserEvent({});
  const result = parsePolicyRule(
    event as typeof event & { content: UnredactedPolicyContent }
  );
  if (isError(result)) {
    throw new TypeError("Should be able to parse the policy rule");
  }
  expect(result.ok.expiry).toBeUndefined();
});

describe("isExpired", function () {
  test("A rule with no expiry is never expired", function () {
    const event = makePolicyRuleUserEvent({});
    const result = parsePolicyRule(
      event as typeof event & { content: UnredactedPolicyContent }
    ).expect("Should be able to parse the policy rule");
    expect(isExpired(result, Date.now())).toBe(false);
  });
  test("A rule expires exactly at its expiry timestamp (inclusive boundary)", function () {
    const event = makePolicyRuleUserEvent({ expiry: 1000 });
    const rule = parsePolicyRule(
      event as typeof event & { content: UnredactedPolicyContent }
    ).expect("Should be able to parse the policy rule");
    expect(isExpired(rule, 999)).toBe(false);
    expect(isExpired(rule, 1000)).toBe(true);
    expect(isExpired(rule, 1001)).toBe(true);
  });
});
