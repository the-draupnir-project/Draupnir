// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import { PowerLevelPermission } from "../Client/PowerLevelsMirror";
import { StandardConfigDescription } from "../Config/ConfigDescription";
import { Ok, isError } from "../Interface/Action";
import { Logger } from "../Logging/Logger";
import { PowerLevelsEventContent } from "../MatrixTypes/PowerLevels";
import { Membership } from "../Membership/MembershipChange";
import {
  describeProtectedRoomsSet,
  describeRoom,
} from "../StateTracking/DeclareRoomState";
import { randomRoomID, randomUserID } from "../TestUtilities/EventGeneration";
import { ProtectionDescription } from "./Protection";
import { RoomCreateContent } from "../MatrixTypes/CreateRoom";

const log = new Logger("ProtectionHandles.test");

test("handlePermissionRequirementsMet is called when a new room is added with met permissions", async function () {
  const userID = randomUserID();
  const { protectedRoomsSet, roomStateManager, roomMembershipManager } =
    await describeProtectedRoomsSet({
      clientUserID: userID,
    });
  const newRoomMatrixID = randomRoomID([]);
  const newRoom = describeRoom({
    room: newRoomMatrixID,
    membershipDescriptions: [
      {
        sender: userID,
        membership: Membership.Join,
      },
    ],
    stateDescriptions: [
      {
        content: {
          room_version: "11",
        } satisfies RoomCreateContent,
        sender: userID,
        type: "m.room.create",
        state_key: "",
      },
      {
        content: {
          users_default: 100,
          ban: 0,
        } as PowerLevelsEventContent,
        type: "m.room.power_levels",
        sender: userID,
      },
    ],
  });
  let handleCalled = false;
  const protectionDescription: ProtectionDescription = {
    name: "test",
    description: "test description",
    capabilities: {},
    defaultCapabilities: {},
    protectionSettings: new StandardConfigDescription(Type.Object({})),
    async factory(
      description,
      _protectedRoomsSet,
      _context,
      _capabilities,
      _settings
    ) {
      return Ok({
        description,
        requiredPermissions: [PowerLevelPermission.Ban],
        requiredEventPermissions: [],
        requiredStatePermissions: [],
        handlePermissionRequirementsMet(room) {
          if (room.toRoomIDOrAlias() === newRoomMatrixID.toRoomIDOrAlias()) {
            handleCalled = true;
          }
        },
        [Symbol.asyncDispose]() {
          return Promise.resolve();
        },
      });
    },
  };
  const protectionAddResult = await protectedRoomsSet.protections.addProtection(
    protectionDescription,
    protectedRoomsSet,
    undefined
  );
  if (isError(protectionAddResult)) {
    throw new TypeError(`Shouldn't fail here`);
  }
  expect(handleCalled).toBe(false);
  roomStateManager.addIssuer(newRoom.stateRevisionIssuer);
  roomMembershipManager.addIssuer(newRoom.membershipRevisionIssuer);
  const addResult = await protectedRoomsSet.protectedRoomsManager.addRoom(
    newRoom.membershipRevisionIssuer.room
  );
  if (isError(addResult)) {
    log.error(`Couldn't add room`, addResult);
    throw new TypeError(`Couldn't add a room`);
  }
  expect(handleCalled).toBe(true);
});
