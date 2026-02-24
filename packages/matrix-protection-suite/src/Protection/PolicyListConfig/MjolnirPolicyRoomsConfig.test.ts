// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError } from "../../Interface/Action";
import { FakePersistentConfigBackend } from "../../Interface/FakePersistentMatrixData";
import { PolicyRuleType } from "../../MatrixTypes/PolicyEvents";
import { Recommendation } from "../../PolicyList/PolicyRule";
import { describeRoom } from "../../StateTracking/DeclareRoomState";
import { FakePolicyRoomManager } from "../../StateTracking/FakePolicyRoomManager";
import { MjolnirPolicyRoomsConfig } from "./MjolnirPolicyRoomsConfig";
import { DummyRoomJoiner } from "../../Client/DummyClientPlatform";
import { MjolnirPolicyRoomsEncodedShape } from "./MjolnirPolicyRoomsDescription";
import { StandardWatchedPolicyRooms } from "../WatchedPolicyRooms/StandardWatchedPolicyRooms";

test("That creating a MjolnirPolicyRoomsConfig will correctly load rooms that already have policies in them", async function () {
  const targetUser = "@spam:example.com";
  const policyRoom = describeRoom({
    policyDescriptions: [
      {
        entity: targetUser,
        type: PolicyRuleType.User,
      },
    ],
  });
  const policyRoomManager = new FakePolicyRoomManager([
    policyRoom.policyRevisionIssuer,
  ]);
  const policyListConfigAccountData =
    new FakePersistentConfigBackend<MjolnirPolicyRoomsEncodedShape>({
      references: [policyRoom.policyRevisionIssuer.room.toPermalink()],
    });
  const policyRoomsConfigResult =
    await MjolnirPolicyRoomsConfig.createFromStore(
      policyListConfigAccountData,
      DummyRoomJoiner
    );
  if (isError(policyRoomsConfigResult)) {
    throw new TypeError(
      `Couldn't create the fake policy rooms config to setup the test`
    );
  }
  const watchedPolicyRooms = (
    await StandardWatchedPolicyRooms.create(
      policyRoomsConfigResult.ok,
      policyRoomManager,
      DummyRoomJoiner
    )
  ).expect(
    "Should be able to create the watched policy rooms with the mjolnir config"
  );
  expect(watchedPolicyRooms.currentRevision.allRules().length).toBe(1);
  expect(
    watchedPolicyRooms.currentRevision.findRuleMatchingEntity(targetUser, {
      type: PolicyRuleType.User,
      recommendation: Recommendation.Ban,
      searchHashedRules: false,
    })
  ).toBeDefined();
});
