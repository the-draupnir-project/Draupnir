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
  isStringUserID,
  MatrixUserID,
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
  PolicyRuleMatchType,
  PolicyListRevision,
} from "matrix-protection-suite";
import { UnlistedUserRedactionQueue } from "../../queues/UnlistedUserRedactionQueue";
import { ListMatches } from "../Rules";
import { MemberRooms, UnbanMembersPreview, UnbanMembersResult } from "./Unban";

export function matchMembers(
  setRoomMembership: SetRoomMembership,
  matches: {
    globs: MatrixGlob[];
    literals: StringUserID[];
  },
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
      if (
        matches.literals.includes(membership.userID) ||
        matches.globs.some((glob) => glob.test(membership.userID))
      ) {
        addRoomMembership(membership, revision.room);
      }
    }
  }
  return [...map.values()];
}

export function revisionRulesMatchingEntity(
  entity: string,
  ruleType: PolicyRuleType,
  recommendations: Recommendation[],
  revision: PolicyListRevision
): PolicyRule[] {
  return recommendations.flatMap((recommendation) =>
    revision.allRulesMatchingEntity(entity, {
      type: ruleType,
      recommendation,
      searchHashedRules: true,
    })
  );
}

export function revisionRulesMatchingUser(
  userID: StringUserID,
  recommendations: Recommendation[],
  revision: PolicyListRevision
): PolicyRule[] {
  return [
    ...revisionRulesMatchingEntity(
      userID,
      PolicyRuleType.User,
      recommendations,
      revision
    ),
    ...revisionRulesMatchingEntity(
      userServerName(userID),
      PolicyRuleType.Server,
      recommendations,
      revision
    ),
  ];
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
    const memberPolicies = revisionRulesMatchingUser(
      user,
      [Recommendation.Ban, Recommendation.Takedown],
      watchedPolicyRooms.currentRevision
    );
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
          await policyRoomEditor.ok.removePolicyByStateKey(
            policy.kind,
            policy.sourceEvent.state_key
          )
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

export function findUnbanInformationForMember(
  setRoomMembership: SetRoomMembership,
  entity: MatrixUserID,
  watchedPolicyRooms: WatchedPolicyRooms,
  { inviteMembers }: { inviteMembers: boolean }
): UnbanMembersPreview {
  const membersMatchingEntity = matchMembers(
    setRoomMembership,
    {
      ...(entity.isContainingGlobCharacters()
        ? { globs: [new MatrixGlob(entity.toString())], literals: [] }
        : { literals: [entity.toString()], globs: [] }),
    },
    { inviteMembers }
  );
  // we need to also search for policies that match the literal rule given to us
  const policyEntitiesToSearchFor = new Set([
    ...membersMatchingEntity.map((memberRooms) => memberRooms.member),
    entity.toString(),
  ]);
  const policyMatchesToRemove = findBanPoliciesMatchingUsers(
    watchedPolicyRooms,
    [...policyEntitiesToSearchFor]
  );
  const globsToScan: MatrixGlob[] = [
    ...(entity.isContainingGlobCharacters()
      ? [new MatrixGlob(entity.toString())]
      : []),
  ];
  const literalsToScan: StringUserID[] = [
    ...(entity.isContainingGlobCharacters() ? [] : [entity.toString()]),
  ];
  for (const { matches } of policyMatchesToRemove) {
    for (const match of matches) {
      if (match.matchType === PolicyRuleMatchType.Glob) {
        globsToScan.push(new MatrixGlob(match.entity));
      } else if (
        match.matchType === PolicyRuleMatchType.Literal &&
        isStringUserID(match.entity)
      ) {
        literalsToScan.push(match.entity);
      }
      // HashedLiterals that match will be removed indriectly when their sourceEvent's
      // get removed.
    }
  }
  const membersMatchingPoliciesAndEntity = matchMembers(
    setRoomMembership,
    { globs: globsToScan, literals: literalsToScan },
    { inviteMembers }
  );
  const isMemberStillBannedAfterPolicyRemoval = (member: MemberRooms) => {
    const policiesMatchingMember = revisionRulesMatchingUser(
      member.member,
      [Recommendation.Takedown, Recommendation.Ban],
      watchedPolicyRooms.currentRevision
    );
    return (
      policiesMatchingMember.filter(
        (policy) =>
          !policyMatchesToRemove
            .flatMap((list) => list.matches)
            .includes(policy)
      ).length > 0
    );
  };
  // Now we need to filter out only members that are completly free of policies.
  const membersToUnban = membersMatchingPoliciesAndEntity.filter(
    (member) => !isMemberStillBannedAfterPolicyRemoval(member)
  );
  const unbanInformation = {
    policyMatchesToRemove,
    membersToUnban,
    entity,
  };
  return unbanInformation;
}
