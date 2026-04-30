// SPDX-FileCopyrightText: 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ActionError,
  ActionException,
  ActionExceptionKind,
  ActionResult,
  Logger,
  Ok,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  Value,
  assertThrowableIsError,
  isError,
} from "matrix-protection-suite";
import { MembershipEvent } from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import { RoomStateManagerFactory } from "../ClientManagement/RoomStateManagerFactory";
import {
  MatrixRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

const log = new Logger("BotSDKRoomMembershipManager");

async function getRoomMembershipEvents(
  room: MatrixRoomID,
  client: MatrixSendClient
): Promise<ActionResult<MembershipEvent[]>> {
  const rawMembersResult = await client
    .doRequest(
      "GET",
      `/_matrix/client/v3/rooms/${encodeURIComponent(
        room.toRoomIDOrAlias()
      )}/members`
    )
    .then(
      (ok: unknown) => Ok(ok),
      (exception: unknown) =>
        ActionException.Result(
          `Unable to query room members from ${room.toPermalink()}`,
          {
            exception: assertThrowableIsError(exception),
            exceptionKind: ActionExceptionKind.Unknown,
          }
        )
    );
  if (isError(rawMembersResult)) {
    return rawMembersResult;
  }
  const errorMessage = `Unable parse the result of a /members query in ${room.toPermalink()}`;
  const rawMembers = rawMembersResult.ok;
  if (typeof rawMembers !== "object" || rawMembers === null) {
    return ActionError.Result(errorMessage);
  }
  if (!("chunk" in rawMembers) || !Array.isArray(rawMembers["chunk"])) {
    log.error(errorMessage, rawMembersResult);
    return ActionError.Result(errorMessage);
  }
  const members: MembershipEvent[] = [];
  for (const rawEvent of rawMembers["chunk"]) {
    const memberResult = Value.Decode(MembershipEvent, rawEvent);
    if (isError(memberResult)) {
      log.error(
        // Really we'd have something other than adhoc validation, generated from the OpenAPI Schema for the response
        // we don't have that though....
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Unable to parse the event ${rawEvent.event_id} from ${rawEvent.room_id}`,
        JSON.stringify(rawEvent),
        memberResult.error
      );
      continue;
    }
    members.push(memberResult.ok);
  }
  return Ok(members);
}
export class BotSDKRoomMembershipManager implements RoomMembershipManager {
  public constructor(
    public readonly clientUserID: StringUserID,
    private readonly client: MatrixSendClient,
    private readonly factory: RoomStateManagerFactory
  ) {
    // nothing to do.
  }

  public async getRoomMembershipRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomMembershipRevisionIssuer>> {
    return await this.factory.getRoomMembershipRevisionIssuer(
      room,
      this.clientUserID
    );
  }

  public async getRoomMembershipEvents(
    room: MatrixRoomID
  ): Promise<ActionResult<MembershipEvent[]>> {
    return await getRoomMembershipEvents(room, this.client);
  }
}
