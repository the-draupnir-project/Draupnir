// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// So the purpose of this is just to remove all policies related to an entity.
// Prompt which policies will be removed, and then remove them if it's accepted.
// For finer control, they will need to use policy remove command.

import {
  isStringRoomID,
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  PolicyRoomManager,
  PolicyRuleType,
  Recommendation,
  RoomSetResultBuilder,
  WatchedPolicyRooms,
} from "matrix-protection-suite";
import { ListMatches } from "../Rules";
import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { UnbanEntityPreview, UnbanEntityResult } from "./Unban";

export function findPoliciesToRemove(
  entity: MatrixRoomID | string,
  watchedPolicyRooms: WatchedPolicyRooms
): UnbanEntityPreview {
  const entityType =
    entity instanceof MatrixRoomID
      ? PolicyRuleType.Room
      : PolicyRuleType.Server;
  const matches: ListMatches[] = [];
  for (const profile of watchedPolicyRooms.allRooms) {
    matches.push({
      room: profile.room,
      roomID: profile.room.toRoomIDOrAlias(),
      profile,
      matches: [Recommendation.Ban, Recommendation.Takedown].flatMap(
        (recommendation) =>
          profile.revision.allRulesMatchingEntity(entity.toString(), {
            type: entityType,
            searchHashedRules: true,
            recommendation,
          })
      ),
    });
  }
  return {
    entity,
    policyMatchesToRemove: matches,
  };
}

export async function unbanEntity(
  entity: StringRoomID | string,
  policyRoomManager: PolicyRoomManager,
  policyMatches: UnbanEntityPreview
): Promise<Result<UnbanEntityResult>> {
  const entityType = isStringRoomID(entity)
    ? PolicyRuleType.Room
    : PolicyRuleType.Server;
  const policiesRemoved = new RoomSetResultBuilder();
  for (const matches of policyMatches.policyMatchesToRemove) {
    const editor = await policyRoomManager.getPolicyRoomEditor(matches.room);
    if (isError(editor)) {
      policiesRemoved.addResult(
        matches.roomID,
        editor.elaborate("Unable to obtain the policy room editor")
      );
    } else {
      policiesRemoved.addResult(
        matches.roomID,
        (await editor.ok.unbanEntity(entityType, entity)) as Result<void>
      );
    }
  }
  return Ok({
    ...policyMatches,
    policyRemovalResult: policiesRemoved.getResult(),
  });
}
