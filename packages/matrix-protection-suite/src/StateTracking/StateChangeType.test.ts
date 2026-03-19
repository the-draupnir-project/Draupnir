// SPDX-FileCopyrightText: 2023-2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// please note that the changes calculated from this test need to be tested
// against the standard policy list revision.

import { PolicyRuleType } from "../MatrixTypes/PolicyEvents";
import { describePolicyRule, describeRoomMember } from "./DeclareRoomState";
import { StandardRoomStateRevision } from "./StandardRoomStateRevision";
import { randomRoomID, randomUserID } from "../TestUtilities/EventGeneration";
import { StateChangeType } from "./StateChangeType";
import { Membership } from "../Membership/MembershipChange";

// if events aren't normalized as they are indexed then we really need to make
// sure that the policy room editor removes them according to their source
// event type, not their normalised state type.

// So in case you haven't realised, we've started using the state revision here,
// which might change the meaning of the test.
// in the early days of MPS we allowed policy list revisions to be created
// without depending on a room state revision to be informed of changes.
// that's probably going to change, so that policyRoomRevision don't have
// a method to `reviseFromState`.

test("A new policy rule will be seen as an Introduced rule by the revision", function () {
  const blankRevision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  );
  const changes = blankRevision.changesFromState([
    describePolicyRule({
      type: PolicyRuleType.User,
      entity: randomUserID(),
    }),
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.Introduced);
});
test("Sending a contentful state event over a blank state event with the same type-key pair will be seen as Reintroducing a rule", function () {
  const entity = randomUserID();
  const policy = describePolicyRule({
    type: PolicyRuleType.User,
    entity,
  });
  const revision = StandardRoomStateRevision.blankRevision(randomRoomID([]))
    .reviseFromState([policy])
    .reviseFromState([
      describePolicyRule({
        remove: policy,
      }),
    ]);
  const changes = revision.changesFromState([policy]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.Reintroduced);
});
test("A redacted event state event that is returned by `/state` on a blank revision should result in IntroducedAsEmpty", function () {
  const policy = describePolicyRule({
    type: PolicyRuleType.User,
    entity: randomUserID(),
  });
  const blankRevision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  );
  const changes = blankRevision.changesFromState([
    {
      ...policy,
      content: {},
      unsigned: {
        redacted_because: {
          reason: "unbanning the user",
        },
      },
    },
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.IntroducedAsBlank);
});
test("Sending a blank state event to an already blank type-key pair will result in BlankingEmptyContent", function () {
  const entity = randomUserID();
  const policy = describePolicyRule({
    type: PolicyRuleType.User,
    entity,
  });
  const revision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  ).reviseFromState([
    describePolicyRule({
      remove: policy,
    }),
  ]);
  const changes = revision.changesFromState([
    describePolicyRule({
      remove: policy,
    }),
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.BlankedEmptyContent);
});
test("Sending a blank state event with the same type-key pair will be seen as making the rule have BlankedContent", function () {
  const entity = randomUserID();
  const policy = describePolicyRule({
    type: PolicyRuleType.User,
    entity,
  });
  const revision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  ).reviseFromState([policy]);
  const changes = revision.changesFromState([
    describePolicyRule({
      remove: policy,
    }),
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.BlankedContent);
});
test("Redacting a rule will be seen as CompletelyRedacting a rule (without checking redacted_because)", function () {
  const entity = randomUserID();
  const event = describePolicyRule({
    type: PolicyRuleType.User,
    entity,
  });
  const revision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  ).reviseFromState([event]);
  const changes = revision.changesFromState([
    {
      ...event,
      content: {},
    },
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.CompletelyRedacted);
});
test("A redacted event for an existing state (ensures check for redacted_because)", function () {
  const policy = describePolicyRule({
    type: PolicyRuleType.User,
    entity: randomUserID(),
  });
  const revision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  ).reviseFromState([policy]);
  const changes = revision.changesFromState([
    {
      ...policy,
      content: {},
      unsigned: {
        redacted_because: {
          reason: "unbanning the user",
        },
      },
    },
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.CompletelyRedacted);
});
test("A redacted membership event is classified as PartiallyRedacted because it still has keys", function () {
  const roomID = randomRoomID([]);
  const member = describeRoomMember({
    sender: randomUserID(),
    avatar_url: "mxc://example.com/wiejfoiejf",
    displayname: "Red Wine from Coloroy",
    membership: Membership.Join,
  });
  const revision = StandardRoomStateRevision.blankRevision(
    roomID
  ).reviseFromState([member]);
  const changes = revision.changesFromState([
    {
      ...member,
      content: {
        membership: Membership.Join,
      },
      unsigned: {
        redacted_because: {
          reason: "unbanning the user",
        },
      },
    },
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.PartiallyRedacted);
});
test("A modified rule will be seen as a Superseding an existing rule", function () {
  const entity = randomUserID();
  const revision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  ).reviseFromState([
    describePolicyRule({
      type: PolicyRuleType.User,
      entity,
    }),
  ]);
  const changes = revision.changesFromState([
    describePolicyRule({
      type: PolicyRuleType.User,
      entity,
      reason: "A brand new reason, because the old one was out of date",
    }),
  ]);
  expect(changes.length).toBe(1);
  expect(changes.at(0)?.changeType).toBe(StateChangeType.SupersededContent);
});
test("Recieving the same poliy rule will not count as a modification or addition", function () {
  const policy = describePolicyRule({
    type: PolicyRuleType.User,
    entity: randomUserID(),
  });
  const blankRevision = StandardRoomStateRevision.blankRevision(
    randomRoomID([])
  ).reviseFromState([policy]);
  const changes = blankRevision.changesFromState([policy]);
  expect(changes.length).toBe(0);
});
