// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  Membership,
  MembershipEvent,
  RoomMembershipRevision,
  StringUserID,
} from "matrix-protection-suite";

export function isInvitationForUser(
  event: MembershipEvent,
  clientUserID: StringUserID
): event is MembershipEvent & { content: { membership: Membership.Invite } } {
  return (
    event.state_key === clientUserID &&
    event.content.membership === Membership.Invite
  );
}

export function isSenderJoinedInRevision(
  senderUserID: StringUserID,
  membership: RoomMembershipRevision
): boolean {
  const senderMembership = membership.membershipForUser(senderUserID);
  return Boolean(senderMembership?.content.membership === Membership.Join);
}
