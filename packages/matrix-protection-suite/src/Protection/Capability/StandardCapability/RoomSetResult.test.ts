// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ActionError, Ok } from "../../../Interface/Action";
import {
  randomRoomID,
  randomUserID,
} from "../../../TestUtilities/EventGeneration";
import { ResultForUsersInSetBuilder } from "./RoomSetResult";

test(`RoomSetResult detects failed results correctly`, function () {
  const builder = new ResultForUsersInSetBuilder();
  const userID = randomUserID();
  expect(builder.getResult().isEveryResultOk).toBeTruthy();
  builder.addResult(userID, randomRoomID([]).toRoomIDOrAlias(), Ok(undefined));
  expect(builder.getResult().isEveryResultOk).toBeTruthy();
  expect(
    [...builder.getResult().map.entries()].every(
      ([_key, result]) => result.isEveryResultOk
    )
  ).toBeTruthy();
  builder.addResult(
    userID,
    randomRoomID([]).toRoomIDOrAlias(),
    ActionError.Result(`Failed to ban ${userID}`)
  );
  expect(builder.getResult().isEveryResultOk).toBeFalsy();
  expect(
    [...builder.getResult().map.entries()].some(
      ([_key, result]) => !result.isEveryResultOk
    )
  ).toBeTruthy();
});
