// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import {
  StringUserID,
  MatrixRoomID,
  MatrixGlob,
  StringRoomID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  SetRoomMembership,
  MembershipChange,
  Membership,
  WatchedPolicyRooms,
  PolicyRule,
  Recommendation,
  RoomUnbanner,
  PolicyRoomManager,
  RoomInviter,
  RoomSetResultBuilder,
  ResultForUsersInSetBuilder,
  isError,
  Ok,
  PolicyRuleType,
} from "matrix-protection-suite";
import { UnlistedUserRedactionQueue } from "../../queues/UnlistedUserRedactionQueue";
import { ListMatches } from "../Rules";
import { MemberRooms, UnbanMembersPreview, UnbanMembersResult } from "./Unban";

export function findMembersMatchingGlob(
  setRoomMembership: SetRoomMembership,
  glob: MatrixGlob,
  options: { inviteMembers: boolean }
): MemberRooms[] {
  const map = new Map<StringUserID, MemberRooms>();
  const addRoomMembership = (
    membership: MembershipChange,
    room: MatrixRoomID
  ) => {
    const isToInvite = (() => {
      if (!options.inviteMembers) {
        return false;
      }
      switch (membership.membership) {
        case Membership.Ban:
        case Membership.Leave:
          return membership.userID !== membership.sender;
        default:
          return false;
      }
    })();
    const isToUnban = membership.membership === Membership.Ban;
    if (!isToInvite && !isToUnban) {
      return;
    }
    const entry = map.get(membership.userID);
    if (entry === undefined) {
      map.set(membership.userID, {
        member: membership.userID,
        roomsBannedFrom: isToUnban ? [room] : [],
        roomsToInviteTo: isToInvite ? [room] : [],
      });
    } else {
      if (isToInvite) {
        entry.roomsToInviteTo.push(room);
      }
      if (isToUnban) {
        entry.roomsBannedFrom.push(room);
      }
    }
  };
  for (const revision of setRoomMembership.allRooms) {
    for (const membership of revision.members()) {
      if (glob.test(membership.userID)) {
        addRoomMembership(membership, revision.room);
      }
    }
  }
  return [...map.values()];
}
export function findBanPoliciesMatchingUsers(
  watchedPolicyRooms: WatchedPolicyRooms,
  users: StringUserID[]
): ListMatches[] {
  const policies = new Map<StringRoomID, Set<PolicyRule>>();
  const addPolicy = (policyRule: PolicyRule) => {
    const entry = policies.get(policyRule.sourceEvent.room_id);
    if (entry === undefined) {
      policies.set(policyRule.sourceEvent.room_id, new Set([policyRule]));
    } else {
      entry.add(policyRule);
    }
  };
  for (const user of users) {
    const memberPolicies = [
      ...watchedPolicyRooms.currentRevision.allRulesMatchingEntity(
        user,
        PolicyRuleType.User,
        Recommendation.Ban
      ),
      ...watchedPolicyRooms.currentRevision.allRulesMatchingEntity(
        userServerName(user),
        PolicyRuleType.Server,
        Recommendation.Ban
      ),
    ];
    for (const policy of memberPolicies) {
      addPolicy(policy);
    }
  }
  return [...policies.entries()].map(([roomID, matches]) => {
    const profile = watchedPolicyRooms.allRooms.find(
      (profile) => profile.room.toRoomIDOrAlias() === roomID
    );
    if (profile === undefined) {
      throw new TypeError(
        `Shouldn't be possible to have sourced policies from an unwatched list`
      );
    }
    return {
      room: profile.room,
      roomID: profile.room.toRoomIDOrAlias(),
      revision: profile.revision,
      profile,
      matches: [...matches],
    };
  });
}

export async function unbanMembers(
  members: UnbanMembersPreview,
  capabilities: {
    roomUnbanner: RoomUnbanner;
    policyRoomManager: PolicyRoomManager;
    roomInviter: RoomInviter;
    unlistedUserRedactionQueue: UnlistedUserRedactionQueue;
  },
  options: { inviteMembers: boolean }
): Promise<Result<UnbanMembersResult>> {
  const policiesRemoved = new RoomSetResultBuilder();
  const unbanResultBuilder = new ResultForUsersInSetBuilder();
  const invitationsSent = new ResultForUsersInSetBuilder();
  for (const policyRoom of members.policyMatchesToRemove) {
    const policyRoomEditor =
      await capabilities.policyRoomManager.getPolicyRoomEditor(policyRoom.room);
    if (isError(policyRoomEditor)) {
      policiesRemoved.addResult(policyRoom.roomID, policyRoomEditor);
    } else {
      for (const policy of policyRoom.matches) {
        policiesRemoved.addResult(
          policyRoom.roomID,
          (await policyRoomEditor.ok.removePolicy(
            policy.kind,
            policy.recommendation,
            policy.entity
          )) as Result<void>
        );
      }
    }
  }
  // There's no point in unbanning and inviting if policies are still enacted against users.
  if (!policiesRemoved.getResult().isEveryResultOk) {
    return Ok({
      ...members,
      policyRemovalResult: policiesRemoved.getResult(),
      usersUnbanned: unbanResultBuilder.getResult(),
      usersInvited: invitationsSent.getResult(),
    });
  }
  for (const member of members.membersToUnban) {
    capabilities.unlistedUserRedactionQueue.removeUser(member.member);
    for (const room of member.roomsBannedFrom) {
      unbanResultBuilder.addResult(
        member.member,
        room.toRoomIDOrAlias(),
        await capabilities.roomUnbanner.unbanUser(room, member.member)
      );
    }
    for (const room of member.roomsToInviteTo) {
      if (options.inviteMembers) {
        invitationsSent.addResult(
          member.member,
          room.toRoomIDOrAlias(),
          await capabilities.roomInviter.inviteUser(room, member.member)
        );
      }
    }
  }
  return Ok({
    ...members,
    policyRemovalResult: policiesRemoved.getResult(),
    usersUnbanned: unbanResultBuilder.getResult(),
    usersInvited: invitationsSent.getResult(),
  });
}
