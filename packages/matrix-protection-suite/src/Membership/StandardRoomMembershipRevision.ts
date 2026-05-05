// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StaticDecode } from "@sinclair/typebox";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import {
  Membership,
  MembershipChange,
  membershipChangeType,
  profileChangeType,
} from "./MembershipChange";
import { RoomMembershipRevision } from "./MembershipRevision";
import { Map as PersistentMap, Set as PersistentSet } from "immutable";
import { Logger } from "../Logging/Logger";
import { SafeMembershipEventMirror } from "../SafeMatrixEvents/SafeMembershipEvent";
import {
  MatrixRoomID,
  StringEventID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

const log = new Logger("StandardRoomMembershipRevision");

type MembershipByUserID = PersistentMap<StringUserID, MembershipChange>;

type MembershipByEventID = PersistentMap<StringEventID, MembershipChange>;

type MembershipByMembership = PersistentMap<
  Membership,
  PersistentSet<MembershipChange>
>;

export class StandardRoomMembershipRevision implements RoomMembershipRevision {
  private constructor(
    public readonly room: MatrixRoomID,
    public readonly membershipByUserID: MembershipByUserID,
    public readonly membershipByEventID: MembershipByEventID,
    public readonly membershipByMembership: MembershipByMembership
  ) {
    // nothing to do.
  }

  public static blankRevision(
    room: MatrixRoomID
  ): StandardRoomMembershipRevision {
    return new StandardRoomMembershipRevision(
      room,
      PersistentMap(),
      PersistentMap(),
      PersistentMap()
    );
  }

  public members() {
    return this.membershipByEventID.values();
  }

  public membersOfMembership(
    membership: Membership
  ): IterableIterator<MembershipChange> {
    return this.membershipByMembership
      .get(membership, PersistentSet<MembershipChange>())
      .values();
  }

  public hasEvent(eventID: StringEventID): boolean {
    return this.membershipByEventID.has(eventID);
  }

  public membershipForUser(userID: StringUserID): MembershipChange | undefined {
    return this.membershipByUserID.get(userID);
  }

  public changesFromMembership(
    membershipEvents: StaticDecode<typeof MembershipEvent>[]
  ): MembershipChange[] {
    const changes: MembershipChange[] = [];
    for (const event of membershipEvents) {
      if (this.hasEvent(event.event_id)) {
        continue;
      }
      // There is a distinguishment between our previous event
      // and the server's claim for prev_content.
      const localPreviousEvent = this.membershipForUser(event.state_key);
      // interestingly, if the parser for MembershipEvent eagerly parsed
      // previous_content and there was an error in the previous_content,
      // but not the top level. Then there would be a very bad situation.
      // So we need SafeMembershipEventMirror that can parse unsigned for us
      // in the same way. Perhaps there needs to be a generic SafeMatrixEvent
      // utility to use as a base though.
      const citedPreviousMembership =
        event.unsigned?.prev_content === undefined
          ? undefined
          : event.unsigned.prev_content === null
            ? undefined
            : SafeMembershipEventMirror.parse(
                event.unsigned.prev_content as Record<string, unknown>
              ).match(
                (ok) => ok,
                (error) => {
                  log.error(
                    `Unable to decode previous membership for ${
                      event.state_key
                    } within ${this.room.toPermalink()}. This is a serious error and the developers should be notified.`,
                    JSON.stringify(event.unsigned?.prev_content),
                    error
                  );
                  return undefined;
                }
              );
      const membershipChange = membershipChangeType(
        event,
        localPreviousEvent ?? citedPreviousMembership
      );
      const profileChange = profileChangeType(
        event,
        localPreviousEvent ?? citedPreviousMembership
      );
      changes.push(
        new MembershipChange(
          event.state_key,
          event.sender,
          event.room_id,
          event.event_id,
          event.content.membership,
          membershipChange,
          profileChange,
          event.content
        )
      );
    }
    return changes;
  }
  public reviseFromChanges(
    changes: MembershipChange[]
  ): StandardRoomMembershipRevision {
    let nextMembershipByUserID = this.membershipByUserID;
    let nextMembershipByEventID = this.membershipByEventID;
    let nextMembershipByMembership = this.membershipByMembership;
    for (const change of changes) {
      nextMembershipByUserID = nextMembershipByUserID.set(
        change.userID,
        change
      );
      const existingMembership = this.membershipForUser(change.userID);
      if (existingMembership !== undefined) {
        nextMembershipByEventID = nextMembershipByEventID.delete(
          existingMembership.eventID
        );
      }
      nextMembershipByEventID = nextMembershipByEventID.set(
        change.eventID,
        change
      );
      if (existingMembership) {
        nextMembershipByMembership = nextMembershipByMembership.set(
          existingMembership.membership as Membership,
          nextMembershipByMembership
            .get(
              existingMembership.membership as Membership,
              PersistentSet<MembershipChange>()
            )
            .delete(existingMembership)
        );
      }
      nextMembershipByMembership = nextMembershipByMembership.set(
        change.membership as Membership,
        nextMembershipByMembership
          .get(
            change.membership as Membership,
            PersistentSet<MembershipChange>()
          )
          .add(change)
      );
    }
    return new StandardRoomMembershipRevision(
      this.room,
      nextMembershipByUserID,
      nextMembershipByEventID,
      nextMembershipByMembership
    );
  }

  public reviseFromMembership(
    membershipEvents: StaticDecode<typeof MembershipEvent>[]
  ): StandardRoomMembershipRevision {
    const changes = this.changesFromMembership(membershipEvents);
    return this.reviseFromChanges(changes);
  }
}
