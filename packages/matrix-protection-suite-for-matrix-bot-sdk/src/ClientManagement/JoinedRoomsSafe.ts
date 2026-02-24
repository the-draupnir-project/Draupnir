// SPDX-FileCopyrightText: 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ActionException,
  ActionExceptionKind,
  JoinedRoomsSafe,
  Ok,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";

export function makeJoinedRoomsSafe(
  client: MatrixSendClient,
  clientUserID: StringRoomID
): JoinedRoomsSafe {
  return () => {
    return client.getJoinedRooms().then(
      (rooms) => Ok(rooms as StringRoomID[]),
      (exception: unknown) =>
        ActionException.Result(
          `Unable to fetch the joined rooms for ${clientUserID}`,
          {
            exception,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        )
    );
  };
}
