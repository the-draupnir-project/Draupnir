/**
 * Copyright (C) 2023-2024 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionException, ActionExceptionKind, ActionResult, ClientRooms, JoinedRoomsRevision, JoinedRoomsSafe, Ok, RoomStateManager, StandardClientRooms, StandardJoinedRoomsRevision, StringUserID, isError } from "matrix-protection-suite";

export class DraupnirClientRooms extends StandardClientRooms implements ClientRooms {
  private constructor(
    roomStateManager: RoomStateManager,
    joinedRoomsThunk: JoinedRoomsSafe,
    clientUserID: StringUserID,
    joinedRoomsRevision: JoinedRoomsRevision
  ) {
    super(
        roomStateManager,
        joinedRoomsThunk,
        clientUserID,
        joinedRoomsRevision
    );
  }

  public static async makeClientRooms(
    roomStateManager: RoomStateManager,
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
            roomStateManager,
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
