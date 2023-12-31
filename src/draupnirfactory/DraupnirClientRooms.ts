/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionException, ActionExceptionKind, ActionResult, ClientRooms, JoinedRoomsRevision, JoinedRoomsSafe, Ok, StandardClientRooms, StandardJoinedRoomsRevision, StringUserID, isError } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";

export class DraupnirClientRooms extends StandardClientRooms implements ClientRooms {
  private constructor(
    client: Draupnir,
    joinedRoomsThunk: JoinedRoomsSafe,
    clientUserID: StringUserID,
    joinedRoomsRevision: JoinedRoomsRevision
  ) {
    super(
        client,
        joinedRoomsThunk,
        clientUserID,
        joinedRoomsRevision
    );
  }

  public static async makeClientRooms(
    client: Draupnir,
    joinedRoomsThunk: JoinedRoomsSafe,
    clientUserID: StringUserID,
  ): Promise<ActionResult<DraupnirClientRooms>> {
    try {
        const joinedRooms = await joinedRoomsThunk();
        if (isError(joinedRooms)) {
          return joinedRooms;
        }
        const revision = StandardJoinedRoomsRevision.blankRevision(
          clientUserID
        ).reviseFromJoinedRooms(joinedRooms.ok);
        return Ok(new DraupnirClientRooms(
            client,
            joinedRoomsThunk,
            clientUserID,
            revision
        ))
    } catch (exception) {
        return ActionException.Result(
            `Couldn't create client rooms`,
            {
                exception,
                exceptionKind: ActionExceptionKind.Unknown
            }
        )
    }
  }
}
