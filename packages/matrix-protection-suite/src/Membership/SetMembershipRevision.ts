// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  Membership,
  MembershipChange,
  MembershipChangeType,
} from "./MembershipChange";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomMembershipRevision } from "./MembershipRevision";
import { Map as PersistentMap, Set as PersistentSet } from "immutable";

export enum SetMembershipKind {
  // incorporates knock, join, invite
  Present = "present",
  // incorporates leave, ban, and never present
  Absent = "absent",
}

export enum SetMembershipChangeType {
  BecamePresent = "became_present",
  BecameAbsent = "became_absent",
  NoOverallChange = "no_overall_change",
}

export type SetMembershipChange = {
  userID: StringUserID;
  changeType: SetMembershipChangeType;
  roomsJoined: number;
  roomsLeft: number;
};

export type SetMembershipDelta = {
  addedRoom: StringRoomID | undefined;
  removedRoom: StringRoomID | undefined;
  changes: SetMembershipChange[];
};

export interface SetMembershipRevision {
  /**
   * Revise from changes to a roomMembershipRevisionIssuer
   */
  changesFromMembershipChanges(changes: MembershipChange[]): SetMembershipDelta;
  /**
   * Revise from a new room in the room set we are modelling.
   */
  changesFromAddedRoom(
    roomMembershipRevision: RoomMembershipRevision
  ): SetMembershipDelta;
  /**
   * Revise from a room being removed from the room set we are modelling.
   */
  changesFromRemovedRoom(
    roomMembershipRevision: RoomMembershipRevision
  ): SetMembershipDelta;
  reviseFromChanges(changes: SetMembershipDelta): SetMembershipRevision;
  presentMembers(): IterableIterator<StringUserID>;
  uniqueMemberCount(): number;
  membershipForUser(userID: StringUserID): SetMembershipKind;
}

export class StandardSetMembershipRevision implements SetMembershipRevision {
  constructor(
    private readonly memberships: PersistentMap<StringUserID, number>,
    private readonly internedRooms: PersistentSet<StringRoomID>
  ) {
    // nothing to do.
  }

  private getMembershipCount(userID: StringUserID): number {
    return this.memberships.get(userID, 0);
  }

  changesFromMembershipChanges(
    membershipChanges: MembershipChange[]
  ): SetMembershipDelta {
    if (
      !membershipChanges.every((change) =>
        this.internedRooms.has(change.roomID)
      )
    ) {
      throw new TypeError(
        "Cannot revise from changes that do not all belong to the same room set."
      );
    }
    const changes = new Map<StringUserID, SetMembershipChange>();
    for (const membershipChange of membershipChanges) {
      const userID = membershipChange.userID;
      const changeType = membershipChange.membershipChangeType;
      const existingEntry = changes.get(userID);
      const change =
        existingEntry === undefined
          ? ((template) => (changes.set(userID, template), template))({
              userID,
              changeType: SetMembershipChangeType.NoOverallChange,
              roomsJoined: 0,
              roomsLeft: 0,
            })
          : existingEntry;
      switch (changeType) {
        case MembershipChangeType.Joined:
        case MembershipChangeType.Rejoined:
        case MembershipChangeType.Invited:
        case MembershipChangeType.Knocked:
        case MembershipChangeType.Reknocked:
          change.roomsJoined += 1;
          break;
        case MembershipChangeType.Left:
        case MembershipChangeType.Kicked:
        case MembershipChangeType.Banned:
          change.roomsLeft += 1;
          break;
      }
      const oldCount = this.getMembershipCount(userID);
      const newCount = oldCount + change.roomsJoined - change.roomsLeft;
      if (oldCount > 0) {
        if (newCount === 0) {
          change.changeType = SetMembershipChangeType.BecameAbsent;
        }
      } else {
        if (newCount > 0) {
          change.changeType = SetMembershipChangeType.BecamePresent;
        }
      }
    }
    return {
      addedRoom: undefined,
      removedRoom: undefined,
      changes: Array.from(changes.values()),
    };
  }

  changesFromAddedRoom(
    roomMembershipRevision: RoomMembershipRevision
  ): SetMembershipDelta {
    if (this.internedRooms.has(roomMembershipRevision.room.toRoomIDOrAlias())) {
      throw new TypeError(
        "Cannot revise from a room that is already in the room set."
      );
    }
    const changes: SetMembershipChange[] = [];
    for (const member of roomMembershipRevision.members()) {
      const existingCount = this.getMembershipCount(member.userID);
      switch (member.membership) {
        case Membership.Join:
        case Membership.Invite:
        case Membership.Knock:
          changes.push({
            userID: member.userID,
            changeType:
              existingCount === 0
                ? SetMembershipChangeType.BecamePresent
                : SetMembershipChangeType.NoOverallChange,
            roomsJoined: 1,
            roomsLeft: 0,
          });
          break;
      }
    }
    return {
      addedRoom: roomMembershipRevision.room.toRoomIDOrAlias(),
      removedRoom: undefined,
      changes,
    };
  }

  changesFromRemovedRoom(
    roomMembershipRevision: RoomMembershipRevision
  ): SetMembershipDelta {
    const changes: SetMembershipChange[] = [];
    for (const member of roomMembershipRevision.members()) {
      const existingCount = this.getMembershipCount(member.userID);
      switch (member.membership) {
        case Membership.Join:
        case Membership.Invite:
        case Membership.Knock: {
          changes.push({
            userID: member.userID,
            changeType:
              existingCount === 1
                ? SetMembershipChangeType.BecameAbsent
                : SetMembershipChangeType.NoOverallChange,
            roomsJoined: 0,
            roomsLeft: 1,
          });
          break;
        }
      }
    }
    return {
      removedRoom: roomMembershipRevision.room.toRoomIDOrAlias(),
      addedRoom: undefined,
      changes,
    };
  }

  reviseFromChanges(delta: SetMembershipDelta): SetMembershipRevision {
    let internedRooms = this.internedRooms;
    if (delta.addedRoom !== undefined) {
      if (internedRooms.has(delta.addedRoom)) {
        throw new TypeError(
          "Cannot revise from a room that is already in the room set."
        );
      }
      internedRooms = internedRooms.add(delta.addedRoom);
    }
    if (delta.removedRoom !== undefined) {
      if (!internedRooms.has(delta.removedRoom)) {
        throw new TypeError(
          "Cannot revise from a room that is not in the room set."
        );
      }
      internedRooms = internedRooms.remove(delta.removedRoom);
    }
    let memberships = this.memberships;
    for (const change of delta.changes) {
      const oldCount = memberships.get(change.userID, 0);
      const newCount = oldCount + change.roomsJoined - change.roomsLeft;
      if (newCount === 0) {
        memberships = memberships.delete(change.userID);
      } else {
        memberships = memberships.set(change.userID, newCount);
      }
    }
    return new StandardSetMembershipRevision(memberships, internedRooms);
  }

  membershipForUser(userID: StringUserID): SetMembershipKind {
    return this.getMembershipCount(userID) > 0
      ? SetMembershipKind.Present
      : SetMembershipKind.Absent;
  }

  presentMembers(): IterableIterator<StringUserID> {
    return this.memberships.keys();
  }

  uniqueMemberCount(): number {
    return this.memberships.size;
  }

  public static blankRevision(): SetMembershipRevision {
    return new StandardSetMembershipRevision(PersistentMap(), PersistentSet());
  }
}
