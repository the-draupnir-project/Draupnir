// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ActionResult, Ok, isError } from "../Interface/Action";
import { Value } from "../Interface/Value";
import { RoomEvent } from "../MatrixTypes/Events";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import { RoomPauser, StandardRoomPauser } from "./RoomPauser";
import {
  AbstractClientRooms,
  ClientRooms,
  ClientRoomsChange,
} from "./ClientRooms";
import AwaitLock from "await-lock";
import { Logger } from "../Logging/Logger";
import { StandardJoinedRoomsRevision } from "./JoinedRoomsRevision";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Membership } from "../Membership/MembershipChange";

const log = new Logger("StandardClientRooms");

export type JoinedRoomsSafe = () => Promise<ActionResult<StringRoomID[]>>;

/**
 * An implementation of `ClientRooms` that will work for both bots and appservice
 * intents.
 */
export class StandardClientRooms
  extends AbstractClientRooms
  implements ClientRooms
{
  private readonly roomPauser: RoomPauser = new StandardRoomPauser();
  private readonly preemptivelyJoinedRooms = new Set<StringRoomID>();
  private readonly joinedRoomsCallLock = new AwaitLock();
  protected constructor(
    private readonly joinedRoomsThunk: JoinedRoomsSafe,
    ...rest: ConstructorParameters<typeof AbstractClientRooms>
  ) {
    super(...rest);
  }

  /**
   * Create a clientRooms, initializing the joinedRoomsSet.
   * @param clientUserID The Matrix UserID of the client.
   * @param joinedRoomsThunk A thunk that returns the rooms the user is joined to.
   * @returns A new ClientRooms instance.
   */
  public static async makeClientRooms(
    clientUserID: StringUserID,
    joinedRoomsThunk: JoinedRoomsSafe
  ): Promise<ActionResult<ClientRooms>> {
    const joinedRooms = await joinedRoomsThunk();
    if (isError(joinedRooms)) {
      return joinedRooms;
    }
    const revision = StandardJoinedRoomsRevision.blankRevision(
      clientUserID
    ).reviseFromJoinedRooms(joinedRooms.ok);
    return Ok(
      new StandardClientRooms(joinedRoomsThunk, clientUserID, revision)
    );
  }
  public get allPreemptedRooms(): StringRoomID[] {
    return [...this.preemptivelyJoinedRooms];
  }
  public isPreemptivelyJoinedRoom(roomID: StringRoomID): boolean {
    return (
      this.joinedRoomsRevision.isJoinedRoom(roomID) ||
      this.preemptivelyJoinedRooms.has(roomID)
    );
  }
  public preemptTimelineJoin(roomID: StringRoomID): void {
    if (this.isPreemptivelyJoinedRoom(roomID)) {
      return;
    }
    this.preemptivelyJoinedRooms.add(roomID);
    const changes: ClientRoomsChange = {
      preemptivelyJoined: [roomID],
      failedPreemptiveJoins: [],
      joined: [],
      parted: [],
    };
    this.emit(
      "revision",
      this.joinedRoomsRevision,
      changes,
      this.joinedRoomsRevision
    );
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    if (
      Value.Check(MembershipEvent, event) &&
      event.state_key === this.clientUserID
    ) {
      switch (event.content.membership) {
        case Membership.Invite:
          // You might be wondering if we should show invitations some other way
          // but this is how appservices also get their invitations, so it makes
          // sense to do it this way for our clients too.
          this.emit("timeline", roomID, event);
          break;
        case Membership.Join:
          if (this.isJoinedRoom(roomID)) {
            this.emit("timeline", roomID, event);
          } else {
            this.handleRoomJoin(roomID, event);
          }
          break;
        case Membership.Leave:
          if (this.isJoinedRoom(roomID)) {
            this.handleRoomLeave(roomID, event);
          } else {
            this.emit("timeline", roomID, event);
          }
          break;
      }
      return;
    } else if (this.isJoinedRoom(roomID)) {
      this.emit("timeline", roomID, event);
    }
  }

  private handleRoomJoin(roomID: StringRoomID, event: RoomEvent): void {
    if (this.roomPauser.isRoomPaused(roomID)) {
      this.roomPauser.handleTimelineEventInPausedRoom(roomID, event);
    } else {
      this.handleRoomChange(roomID);
      this.roomPauser.handleTimelineEventInPausedRoom(roomID, event);
    }
  }

  private handleRoomLeave(roomID: StringRoomID, event: RoomEvent): void {
    if (this.roomPauser.isRoomPaused(roomID)) {
      this.roomPauser.handleTimelineEventInPausedRoom(roomID, event);
    } else {
      this.handleRoomChange(roomID);
      this.roomPauser.handleTimelineEventInPausedRoom(roomID, event);
    }
  }

  private async checkRoomTask(): Promise<void> {
    // we lock specifically so that we can be sure we have checked all the rooms currently marked as preemptively joined
    await this.joinedRoomsCallLock.acquireAsync();
    try {
      const preemptivelyJoinedRoomsToCheck = [...this.preemptivelyJoinedRooms];
      const joinedRoomsResult = await this.joinedRoomsThunk();
      if (isError(joinedRoomsResult)) {
        log.error(
          `Unable to fetch joined_members when calculating joined rooms`,
          joinedRoomsResult.error
        );
        return;
      }
      const joinedRooms = joinedRoomsResult.ok;
      // We have to mark the room as joined before asking for the room state
      // otherwise appservices will not be able to find an intent to use
      // to fetch the sate with.
      const previousRevision = this.joinedRoomsRevision;
      this.joinedRoomsRevision =
        this.joinedRoomsRevision.reviseFromJoinedRooms(joinedRooms);
      const failedPreemptiveJoins = preemptivelyJoinedRoomsToCheck.filter(
        (roomID) => !this.joinedRoomsRevision.isJoinedRoom(roomID)
      );
      if (failedPreemptiveJoins.length > 0) {
        log.error(
          `A caller to ClientRooms preemptTimelineJoin is using the method inappropriately. You should alert the developers with logs and any other context for what you just did, the rooms that were added are:`,
          failedPreemptiveJoins
        );
      }
      for (const roomID of preemptivelyJoinedRoomsToCheck) {
        // all checked rooms need deleting, regardless of whether someone lied to us about joining a room.
        this.preemptivelyJoinedRooms.delete(roomID);
      }
      const changes: ClientRoomsChange = {
        ...previousRevision.changesFromJoinedRooms(joinedRooms),
        preemptivelyJoined: [],
        failedPreemptiveJoins,
      };
      // we have to emit before we preload room state so that the ClientsInRoomsMap can be updated.
      this.emit(
        "revision",
        this.joinedRoomsRevision,
        changes,
        previousRevision
      );
    } finally {
      this.joinedRoomsCallLock.release();
    }
  }

  private handleRoomChange(roomID: StringRoomID): void {
    this.roomPauser.pauseRoom(
      roomID,
      this.checkRoomTask.bind(this),
      this.handleTimelineEvent.bind(this)
    );
  }
}
