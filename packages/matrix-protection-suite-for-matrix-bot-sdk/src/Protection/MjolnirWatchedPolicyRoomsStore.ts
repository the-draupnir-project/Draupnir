// SPDX-FileCopyrightText: 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  PersistentMatrixData,
  ActionResult,
  ActionException,
  ActionExceptionKind,
  Value,
  isError,
  Ok,
  MjolnirWatchedPolicyRoomsEvent,
  MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
  assertThrowableIsError,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";

export class BotSDKMjolnirWatchedPolicyRoomsStore implements PersistentMatrixData<
  typeof MjolnirWatchedPolicyRoomsEvent
> {
  constructor(private readonly client: MatrixSendClient) {
    // nothing to do.
  }
  public requestPersistentData(): Promise<
    ActionResult<MjolnirWatchedPolicyRoomsEvent>
  > {
    return this.client
      .getAccountData(MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE)
      .then(
        (value) => Value.Decode(MjolnirWatchedPolicyRoomsEvent, value),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to load the account data for mjolnir watched_lists`,
            {
              exception: assertThrowableIsError(exception),
              exceptionKind: ActionExceptionKind.Unknown,
            }
          )
      );
  }
  public async storePersistentData(
    data: MjolnirWatchedPolicyRoomsEvent
  ): Promise<ActionResult<void>> {
    const encodedData = Value.Encode(MjolnirWatchedPolicyRoomsEvent, data);
    if (isError(encodedData)) {
      return encodedData;
    }
    return this.client
      .setAccountData(MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE, encodedData.ok)
      .then(
        (_value) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to set account data for mjolnir watched_lists`,
            {
              exception: assertThrowableIsError(exception),
              exceptionKind: ActionExceptionKind.Unknown,
            }
          )
      );
  }
}
