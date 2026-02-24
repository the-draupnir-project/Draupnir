// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// Things to test:
// 1. When it is created, the existing room memberships are accounted for.
//    (Hopefully this can be teststed by also creating set membership and faking
//     the backing store)
// 2. That adding and removing rooms (Draupnir joining and leaving them)
//    works.
// 3. Less important is edge cases for membership changes,
//    possibly detection of invalid states.
//    Hopefully if there is no failure at all, then it keeps the members
//    present rather than abscent.

import {
  describeProtectedRoomsSet,
  describeRoom,
} from "../StateTracking/DeclareRoomState";
import { randomUserID } from "../TestUtilities/EventGeneration";
import { Membership } from "./MembershipChange";
import { StandardSetMembershipRevisionIssuer } from "./SetMembershipRevisionIssuer";

test("That when the SetMembershipRevisionIssuer is created, the existing room memberships are accounted for.", async function () {
  const { protectedRoomsSet } = await describeProtectedRoomsSet({
    rooms: [
      {
        membershipDescriptions: [...Array(10).keys()].map((_) => ({
          sender: randomUserID(),
          membership: Membership.Join,
        })),
        stateDescriptions: [
          {
            sender: randomUserID(),
            type: "m.room.create",
            state_key: "",
            content: {
              room_version: "11",
            },
          },
        ],
      },
    ],
  });
  const setMembershipRevisionIssuer = new StandardSetMembershipRevisionIssuer(
    protectedRoomsSet.setRoomMembership
  );
  expect(
    [...setMembershipRevisionIssuer.currentRevision.presentMembers()].length
  ).toBe(10);
  // check that this one is also constructed properly hmm.
  expect(
    [...protectedRoomsSet.setMembership.currentRevision.presentMembers()].length
  ).toBe(10);
});

test("That adding and removing rooms will update the SetMembershipRevisionIssuer.", async function () {
  const { protectedRoomsSet, roomStateManager, roomMembershipManager } =
    await describeProtectedRoomsSet({
      rooms: [
        {
          membershipDescriptions: [
            {
              sender: randomUserID(),
              membership: Membership.Join,
            },
          ],
          stateDescriptions: [
            {
              sender: randomUserID(),
              type: "m.room.create",
              state_key: "",
              content: {
                room_version: "11",
              },
            },
          ],
        },
      ],
    });
  expect(
    [...protectedRoomsSet.setMembership.currentRevision.presentMembers()].length
  ).toBe(1);
  const newRoom = describeRoom({
    membershipDescriptions: [
      {
        sender: randomUserID(),
        membership: Membership.Join,
      },
    ],
    stateDescriptions: [
      {
        sender: randomUserID(),
        type: "m.room.create",
        state_key: "",
        content: {
          room_version: "11",
        },
      },
    ],
  });
  roomStateManager.addIssuer(newRoom.stateRevisionIssuer);
  roomMembershipManager.addIssuer(newRoom.membershipRevisionIssuer);
  (
    await protectedRoomsSet.protectedRoomsManager.addRoom(
      newRoom.stateRevisionIssuer.room
    )
  ).expect("Should be able to add the new room to the protected rooms set");
  expect(
    [...protectedRoomsSet.setMembership.currentRevision.presentMembers()].length
  ).toBe(2);
  // now let's see if we can remove the room?
  (
    await protectedRoomsSet.protectedRoomsManager.removeRoom(
      newRoom.stateRevisionIssuer.room
    )
  ).expect(
    "Should be able to remove the new room from the protected rooms set"
  );
  expect(
    [...protectedRoomsSet.setMembership.currentRevision.presentMembers()].length
  ).toBe(1);
});
