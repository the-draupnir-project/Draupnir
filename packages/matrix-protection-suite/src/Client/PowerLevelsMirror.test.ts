// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { RoomCreateEvent } from "../MatrixTypes/CreateRoom";
import { PowerLevelsEventContent } from "../MatrixTypes/PowerLevels";
import { describeStateEvent } from "../StateTracking/DeclareRoomState";
import { randomUserID } from "../TestUtilities/EventGeneration";
import { PowerLevelPermission, PowerLevelsMirror } from "./PowerLevelsMirror";

test("What happens when we are missing all permissions", function () {
  const userID = randomUserID();
  const powerLevelscontent: PowerLevelsEventContent = {};
  const result = PowerLevelsMirror.calculateNewMissingPermissions(userID, {
    createEvent: describeStateEvent({
      type: "m.room.create",
      content: {},
      sender: randomUserID(),
      state_key: "",
    }) as RoomCreateEvent,
    nextPowerLevelsContent: powerLevelscontent,
    previousPowerLevelsContent: powerLevelscontent,
    requiredStatePermissions: ["m.room.server_acl"],
    requiredPermissions: [
      PowerLevelPermission.Ban,
      PowerLevelPermission.Redact,
    ],
    requiredEventPermissions: [],
  });
  expect(result.isPrivilidgedInNextPowerLevels).toBe(false);
  expect(result.isPrivilidgedInPriorPowerLevels).toBe(false);
  expect(result.missingStatePermissions.length).toBe(1);
  expect(result.missingPermissions.length).toBe(2);
});
