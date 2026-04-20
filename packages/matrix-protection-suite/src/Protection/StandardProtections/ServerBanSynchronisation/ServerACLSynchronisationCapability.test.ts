// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  PolicyRuleEvent,
  PolicyRuleType,
  UnredactedPolicyContent,
} from "../../../MatrixTypes/PolicyEvents";
import {
  parsePolicyRule,
  Recommendation,
} from "../../../PolicyList/PolicyRule";
import { describePolicyRule } from "../../../StateTracking/DeclareRoomState";
import { StringServerName } from "@the-draupnir-project/matrix-basic-types";
import { compileServerACL } from "./ServerACLSynchronisationCapability";
import { StandardServerBanIntentProjectionNode } from "./ServerBanIntentProjectionNode";
import { monotonicFactory } from "ulidx";
import { PolicyRuleChangeType } from "../../../PolicyList/PolicyRuleChange";

test("ACL compilation works and does not ban our server", async function () {
  const ourServerName = StringServerName("localhost:9999");
  const badServer = "badpeople.example.com";
  const emptyNode =
    StandardServerBanIntentProjectionNode.create(monotonicFactory());
  const emptyACL = compileServerACL(ourServerName, emptyNode).safeAclContent();
  expect(emptyACL.allow).toContain("*");
  expect(emptyACL.allow?.length).toBe(1);
  expect(emptyACL.deny?.length).toBe(0);
  const banPolicyEvent = describePolicyRule({
    type: PolicyRuleType.Server,
    entity: badServer,
    recommendation: Recommendation.Ban,
  });
  const banPolicyRule = parsePolicyRule(
    banPolicyEvent as Omit<PolicyRuleEvent, "content"> & {
      content: UnredactedPolicyContent;
    }
  ).expect("Should be able to parse the policy rule");
  const ourPolicyEvent = describePolicyRule({
    type: PolicyRuleType.Server,
    entity: ourServerName,
    recommendation: Recommendation.Ban,
  });
  const ourBanPolicyRule = parsePolicyRule(
    ourPolicyEvent as Omit<PolicyRuleEvent, "content"> & {
      content: UnredactedPolicyContent;
    }
  ).expect("Should be able to parse the policy rule");
  const nodeWithBans = emptyNode.reduceInput(
    [banPolicyRule, ourBanPolicyRule].map((policy) => ({
      rule: policy,
      sender: policy.sourceEvent.sender,
      event: policy.sourceEvent,
      changeType: PolicyRuleChangeType.Added,
    }))
  ).nextNode;
  const acl = compileServerACL(ourServerName, nodeWithBans).safeAclContent();
  expect(acl.deny?.at(0)).toBe(badServer);
  expect(acl.deny?.length).toBe(1);
  expect(acl.allow?.at(0)).toBe("*");
});
