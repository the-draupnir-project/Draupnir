// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  EDStatic,
  Ok,
  SynapseAdminDeleteRoomRequest,
  SynapseAdminGetUserAdminResponse,
  SynapseAdminPostUserDeactivateRequest,
  SynapseReport,
  Value,
  assertThrowableIsError,
  isError,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";
import {
  resultifyBotSDKRequestError,
  resultifyBotSDKRequestErrorWith404AsUndefined,
} from "../Client/BotSDKBaseClient";
import { SynapseRoomShutdownV2RequestBody } from "./ShutdownV2Endpoint";
import { BlockStatusResponse } from "./BlockStatusEndpoint";
import { RoomDetailsResponse } from "./RoomDetailsEndpoint";
import { UserDetailsResponse } from "./UserDetailsEndpoint";
import {
  UserRedactionResponse,
  UserRedactionStatusResponse,
} from "./UserRedactionEndpoint";
import { Result, ResultError } from "@gnuxie/typescript-result";
import { RoomListQueryParams, RoomListResponse } from "./RoomListEndpoint";

const ReportPollResponse = Type.Object({
  event_reports: Type.Array(SynapseReport),
  next_token: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  total: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
});
type ReportPollResponse = EDStatic<typeof ReportPollResponse>;

/**
 * An account restriction at the minimum stops the user from sending
 * messages.
 */
export enum AccountRestriction {
  Suspended = "suspended",
  Deactivated = "deactivated",
  ShadowBanned = "shadow_banned",
}

export class SynapseAdminClient {
  constructor(
    private readonly client: MatrixSendClient,
    private readonly clientUserID: StringUserID
  ) {
    // nothing to do.
  }

  public async isSynapseAdmin(): Promise<ActionResult<boolean>> {
    const endpoint = `/_synapse/admin/v1/users/${encodeURIComponent(
      this.clientUserID
    )}/admin`;
    const response = await this.client.doRequest("GET", endpoint).then(
      (value) => Ok(value),
      (exception: unknown) =>
        ActionException.Result(
          `Unable to query whether the user ${this.clientUserID} is a Synapse Admin`,
          {
            exception: assertThrowableIsError(exception),
            exceptionKind: ActionExceptionKind.Unknown,
          }
        )
    );
    if (isError(response)) {
      return response;
    }
    const decodedResult = Value.Decode(
      SynapseAdminGetUserAdminResponse,
      response.ok
    );
    if (isError(decodedResult)) {
      return decodedResult;
    } else {
      return Ok(decodedResult.ok.admin ?? false);
    }
  }

  public async deactivateUser(
    targetUserID: StringUserID,
    { erase = false }: SynapseAdminPostUserDeactivateRequest = {}
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/deactivate/${encodeURIComponent(
      targetUserID
    )}`;
    return await this.client
      .doRequest("POST", endpoint, undefined, { erase })
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to deactivate the user ${targetUserID}`,
            {
              exception: assertThrowableIsError(exception),
              exceptionKind: ActionExceptionKind.Unknown,
            }
          )
      );
  }

  public async deleteRoom(
    roomID: StringRoomID,
    { block = true, ...otherOptions }: SynapseAdminDeleteRoomRequest = {}
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(roomID)}`;
    return await this.client
      .doRequest("DELETE", endpoint, null, {
        new_room_user_id: this.clientUserID,
        block,
        ...otherOptions,
      })
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(`Unable to delete the room ${roomID}`, {
            exception: assertThrowableIsError(exception),
            exceptionKind: ActionExceptionKind.Unknown,
          })
      );
  }

  /**
   * Make a user administrator via the Synapse Admin API
   * @param roomId the room where the user (or the bot) shall be made administrator.
   * @param userId optionally specify the user mxID to be made administrator.
   */
  public async makeUserRoomAdmin(
    roomID: StringRoomID,
    userID: StringUserID
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(
      roomID
    )}/make_room_admin`;
    return await this.client
      .doRequest("POST", endpoint, null, {
        user_id: userID,
      })
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to make the user ${userID} admin in room ${roomID}`,
            {
              exception: assertThrowableIsError(exception),
              exceptionKind: ActionExceptionKind.Unknown,
            }
          )
      );
  }

  public async getAbuseReports({
    from,
    direction,
    limit,
  }: { from?: number; direction?: "f" | "b"; limit?: number } = {}): Promise<
    ActionResult<ReportPollResponse>
  > {
    const endpoint = "/_synapse/admin/v1/event_reports";
    const queryParams = {
      ...(from ? { from } : {}),
      ...(direction ? { dir: direction } : {}),
      ...(limit ? { limit } : {}),
    };
    const response = await this.client
      .doRequest("GET", endpoint, queryParams)
      .then((value) => Ok(value), resultifyBotSDKRequestError);
    if (isError(response)) {
      return response;
    }
    return Value.Decode(ReportPollResponse, response.ok);
  }

  public async listRooms(
    options: RoomListQueryParams
  ): Promise<Result<RoomListResponse>> {
    const endpoint = "/_synapse/admin/v1/rooms";
    return await this.client
      .doRequest("GET", endpoint, options)
      .then(
        (response) => Value.Decode(RoomListResponse, response),
        resultifyBotSDKRequestError
      );
  }

  public async shutdownRoomV2(
    roomID: StringRoomID,
    options: SynapseRoomShutdownV2RequestBody
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v2/rooms/${encodeURIComponent(roomID)}`;
    return await this.client
      .doRequest("DELETE", endpoint, null, options)
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async getBlockStatus(
    roomID: StringRoomID
  ): Promise<ActionResult<BlockStatusResponse>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(
      roomID
    )}/block`;
    return await this.client
      .doRequest("GET", endpoint)
      .then(
        (value) => Value.Decode(BlockStatusResponse, value),
        resultifyBotSDKRequestError
      );
  }

  public async getRoomDetails(
    roomID: StringRoomID
  ): Promise<ActionResult<RoomDetailsResponse | undefined>> {
    const endpoint = `/_synapse/admin/v1/rooms/${encodeURIComponent(roomID)}`;
    return await this.client.doRequest("GET", endpoint).then((value) => {
      return Value.Decode(RoomDetailsResponse, value);
    }, resultifyBotSDKRequestErrorWith404AsUndefined);
  }

  public async suspendUser(userID: StringUserID): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/suspend/${encodeURIComponent(userID)}`;
    return await this.client
      .doRequest("PUT", endpoint, null, { suspend: true })
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async unsuspendUser(
    userID: StringUserID
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/suspend/${encodeURIComponent(userID)}`;
    return await this.client
      .doRequest("PUT", endpoint, null, { suspend: false })
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async getUserDetails(
    userID: StringUserID
  ): Promise<ActionResult<UserDetailsResponse | undefined>> {
    const endpoint = `/_synapse/admin/v2/users/${encodeURIComponent(userID)}`;
    return await this.client.doRequest("GET", endpoint).then((value) => {
      return Value.Decode(UserDetailsResponse, value);
    }, resultifyBotSDKRequestErrorWith404AsUndefined);
  }

  public async redactUser(
    userID: StringUserID
  ): Promise<ActionResult<UserRedactionResponse>> {
    const endpoint = `/_synapse/admin/v1/user/${encodeURIComponent(
      userID
    )}/redact`;
    return await this.client
      .doRequest("POST", endpoint, null, { rooms: [] })
      .then((value) => {
        return Value.Decode(UserRedactionResponse, value);
      }, resultifyBotSDKRequestError);
  }

  public async getUserRedactionStatus(
    redactionID: string
  ): Promise<ActionResult<UserRedactionStatusResponse | undefined>> {
    const endpoint = `/_synapse/admin/v1/user/redact_status/${encodeURIComponent(
      redactionID
    )}`;
    return await this.client.doRequest("GET", endpoint).then((value) => {
      return Value.Decode(UserRedactionStatusResponse, value);
    }, resultifyBotSDKRequestErrorWith404AsUndefined);
  }

  public async shadowBanUser(
    userID: StringUserID
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/users/${encodeURIComponent(
      userID
    )}/shadow_ban`;
    return await this.client
      .doRequest("POST", endpoint, null, {})
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async unshadowBanUser(
    userID: StringUserID
  ): Promise<ActionResult<void>> {
    const endpoint = `/_synapse/admin/v1/users/${encodeURIComponent(
      userID
    )}/shadow_ban`;
    return await this.client
      .doRequest("DELETE", endpoint, null, {})
      .then(() => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async unrestrictUser(
    userID: StringUserID
  ): Promise<ActionResult<AccountRestriction>> {
    const details = await this.getUserDetails(userID);
    if (isError(details)) {
      return details;
    } else if (details.ok === undefined) {
      return ResultError.Result(
        `Synapse cannot find details for the user ${userID}`
      );
    } else if (details.ok.shadow_banned) {
      const result = await this.unshadowBanUser(userID);
      if (isError(result)) {
        return result;
      } else {
        return Ok(AccountRestriction.ShadowBanned);
      }
    } else if (details.ok.suspended) {
      const result = await this.unsuspendUser(userID);
      if (isError(result)) {
        return result;
      } else {
        return Ok(AccountRestriction.Suspended);
      }
    } else if (details.ok.locked) {
      return ResultError.Result(`We don't support locking users yet`);
    } else if (details.ok.deactivated) {
      return ResultError.Result(`We can't reactivate users`);
    } else {
      return ResultError.Result(`
        User is already unrestricted`);
    }
  }
}
