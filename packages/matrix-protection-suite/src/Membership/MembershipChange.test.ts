// SPDX-FileCopyrightText: 2023-2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { describeRoomMember } from "../StateTracking/DeclareRoomState";
import { randomUserID } from "../TestUtilities/EventGeneration";
import {
  Membership,
  MembershipChangeType,
  membershipChangeType,
} from "./MembershipChange";

test("Unseen memberships are classified as joins", function () {
  expect(
    membershipChangeType(
      describeRoomMember({
        sender: randomUserID(),
        membership: Membership.Join,
      }),
      undefined
    )
  ).toBe(MembershipChangeType.Joined);
});

test("Invited and knocked users joining are classified as joins", function () {
  const sender = randomUserID();
  const memberships = [Membership.Invite, Membership.Knock];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          sender,
          membership: Membership.Join,
        }),
        describeRoomMember({
          sender,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.Joined);
  }
});

test("Previously discovered memberships are classified as Rejoins", function () {
  const sender = randomUserID();
  const memberships = [
    Membership.Leave,
    // we have to allow Ban -> Join because we might not have complete information
    // we might skip the "unban/leave" event.
    Membership.Ban,
  ];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          sender,
          membership: Membership.Join,
        }),
        describeRoomMember({
          sender,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.Rejoined);
  }
});

// my god there are some depressing shortfalls in MembershipChangeType.
// I don't like it.
test(`Leaving the room by a user's own admission is classified as leaving`, function () {
  const sender = randomUserID();
  // Invite and Knock leaves should really be rejections and (whatever leaving on knock is supposed to mean).
  const memberships = [Membership.Invite, Membership.Knock, Membership.Join];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          sender,
          membership: Membership.Leave,
        }),
        describeRoomMember({
          sender,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.Left);
  }
  expect(
    membershipChangeType(
      describeRoomMember({
        sender,
        target: sender,
        membership: Membership.Leave,
      })
    )
  ).toBe(MembershipChangeType.Left);
});

test(`Being kicked by the room admin is classified as being kicked`, function () {
  const target = randomUserID();
  const memberships = [Membership.Invite, Membership.Knock, Membership.Join];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          target,
          sender: target,
          membership: Membership.Leave,
        }),
        describeRoomMember({
          sender: randomUserID(),
          target,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.Left);
  }
  expect(
    membershipChangeType(
      describeRoomMember({
        target,
        sender: randomUserID(),
        membership: Membership.Leave,
      })
    )
  ).toBe(MembershipChangeType.Kicked);
});

test(`Being banned by the room admin is classified as being banned`, function () {
  const target = randomUserID();
  const memberships = [
    Membership.Invite,
    Membership.Knock,
    Membership.Join,
    Membership.Leave,
  ];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          target,
          sender: target,
          membership: Membership.Ban,
        }),
        describeRoomMember({
          sender: randomUserID(),
          target,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.Banned);
  }
  expect(
    membershipChangeType(
      describeRoomMember({
        target,
        sender: randomUserID(),
        membership: Membership.Ban,
      })
    )
  ).toBe(MembershipChangeType.Banned);
});

test(`Being unbanned by the room admin is classified as being unbanned`, function () {
  // it's important to remember that transitions that get skipped, will be
  // classified as kicked instead...
  const target = randomUserID();
  expect(
    membershipChangeType(
      describeRoomMember({
        target,
        sender: randomUserID(),
        membership: Membership.Leave,
      }),
      describeRoomMember({
        sender: target,
        target,
        membership: Membership.Ban,
      }).content
    )
  ).toBe(MembershipChangeType.Unbanned);
});

test(`Knocking on the room as a user is classified as knocking`, function () {
  const sender = randomUserID();
  expect(
    membershipChangeType(
      describeRoomMember({
        sender,
        membership: Membership.Knock,
      })
    )
  ).toBe(MembershipChangeType.Knocked);
});

test(`Reknocking on the room as a user is classified as reknocking`, function () {
  const sender = randomUserID();
  const memberships = [
    Membership.Invite,
    Membership.Join,
    Membership.Leave,
    Membership.Ban,
  ];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          sender,
          membership: Membership.Knock,
        }),
        describeRoomMember({
          sender,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.Reknocked);
  }
});

test(`Inviting an external user to the room will be classified as invited`, function () {
  const sender = randomUserID();
  expect(
    membershipChangeType(
      describeRoomMember({
        sender,
        target: randomUserID(),
        membership: Membership.Invite,
      })
    )
  ).toBe(MembershipChangeType.Invited);
});

test(`Reinviting a user to the room classified as reinviting them`, function () {
  const sender = randomUserID();
  const memberships = [
    Membership.Join,
    Membership.Leave,
    Membership.Ban,
    Membership.Knock,
  ];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          sender,
          membership: Membership.Invite,
        }),
        describeRoomMember({
          sender,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.Invited);
  }
});

test(`The same states will be classified as no change`, function () {
  const sender = randomUserID();
  const memberships = [
    Membership.Ban,
    Membership.Invite,
    Membership.Join,
    Membership.Knock,
    Membership.Leave,
  ];
  for (const membership of memberships) {
    expect(
      membershipChangeType(
        describeRoomMember({
          sender,
          membership,
        }),
        describeRoomMember({
          sender,
          membership,
        }).content
      )
    ).toBe(MembershipChangeType.NoChange);
  }
});
