// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describeRoomMember } from "../StateTracking/DeclareRoomState";
import { randomRoomID, randomUserID } from "../TestUtilities/EventGeneration";
import { Membership } from "./MembershipChange";
import { StandardRoomMembershipRevision } from "./StandardRoomMembershipRevision";

test("Membership events are unintenrned", function () {
  const joinLeaveUser = randomUserID();
  const room = randomRoomID([]);
  const joinEvent = describeRoomMember({
    sender: joinLeaveUser,
    room_id: room.toRoomIDOrAlias(),
  });
  const leaveEvent = describeRoomMember({
    sender: joinLeaveUser,
    room_id: room.toRoomIDOrAlias(),
    membership: Membership.Leave,
  });
  const revision = StandardRoomMembershipRevision.blankRevision(room)
    .reviseFromMembership([joinEvent])
    .reviseFromMembership([leaveEvent]);
  expect([...revision.members()].length).toBe(1);
});
