/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionException, ActionExceptionKind, ActionResult, JoinedRoomsRevision, JoinedRoomsSafe, MatrixRoomID, Ok, PolicyRoomManager, RoomMembershipManager, RoomStateManager, StandardClientRooms, StandardJoinedRoomsRevision, StringUserID, isError } from "matrix-protection-suite";
import { makeProtectedRoomsSet } from "./DraupnirProtectedRoomsSet";
import { Draupnir } from "../Draupnir";
import { IConfig } from "../config";

export class DraupnirClientRooms extends StandardClientRooms {
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
    managementRoom: MatrixRoomID,
    joinedRoomsThunk: JoinedRoomsSafe,
    clientUserID: StringUserID,
    roomStateManager: RoomStateManager,
    policyRoomManager: PolicyRoomManager,
    roomMembershipManager: RoomMembershipManager
  ): Promise<ActionResult<DraupnirClientRooms>> {
    try {
        const joinedRooms = await joinedRoomsThunk();
        if (isError(joinedRooms)) {
          return joinedRooms;
        }
        const revision = StandardJoinedRoomsRevision.blankRevision(
          clientUserID
        ).reviseFromJoinedRooms(joinedRooms.ok);
        const protectedRoomsSet = await makeProtectedRoomsSet(
            managementRoom,
            roomStateManager,
            policyRoomManager,
            roomMembershipManager,
            client.client,
            clientUserID
        );
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
