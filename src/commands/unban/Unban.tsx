// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  Ok,
  PolicyRoomManager,
  ResultForUsersInSet,
  RoomInviter,
  RoomResolver,
  RoomSetResult,
  RoomUnbanner,
  SetMembershipPolicyRevision,
  SetMembershipRevisionIssuer,
  SetRoomMembership,
  WatchedPolicyRooms,
} from "matrix-protection-suite";
import {
  MatrixGlob,
  MatrixRoomID,
  MatrixUserID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  describeCommand,
  DocumentNode,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StringPresentationType,
  tuple,
  union,
} from "@the-draupnir-project/interface-manager";
import { isError, Result } from "@gnuxie/typescript-result";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "../DraupnirCommandPrerequisites";
import ManagementRoomOutput from "../../managementroom/ManagementRoomOutput";
import { UnlistedUserRedactionQueue } from "../../queues/UnlistedUserRedactionQueue";
import {
  findMembersMatchingGlob,
  findBanPoliciesMatchingUsers,
  unbanMembers,
} from "./UnbanUsers";
import { findPoliciesToRemove, unbanEntity } from "./UnbanEntity";
import { ListMatches, renderListRules } from "../Rules";
import { renderRoomSetResult } from "../../capabilities/CommonRenderers";
import {
  renderMentionPill,
  renderRoomPill,
} from "../interface-manager/MatrixHelpRenderer";

// FIXME: We will need a `policy edit` and `policy remove` command to cover
// for the lack of such functionality in unban now.

export type UnbanEntityPreview = {
  readonly entity: MatrixUserID | MatrixRoomID | string;
  readonly policyMatchesToRemove: ListMatches[];
};

export type UnbanEntityResult = {
  readonly policyRemovalResult: RoomSetResult;
} & UnbanEntityPreview;

export type MemberRooms = {
  member: StringUserID;
  roomsBannedFrom: MatrixRoomID[];
  roomsToInviteTo: MatrixRoomID[];
};

export type UnbanMembersPreview = UnbanEntityPreview & {
  readonly entity: MatrixUserID;
  readonly membersToUnban: MemberRooms[];
};

// The idea is to to only diplay these if at least one result failed.
export type UnbanMembersResult = UnbanMembersPreview & {
  readonly policyRemovalResult: RoomSetResult;
  readonly usersUnbanned: ResultForUsersInSet;
  readonly usersInvited: ResultForUsersInSet;
};

type UnbanCommandResult =
  | UnbanEntityPreview
  | UnbanMembersPreview
  | UnbanEntityResult
  | UnbanMembersResult;

export type DraupnirUnbanCommandContext = {
  policyRoomManager: PolicyRoomManager;
  watchedPolicyRooms: WatchedPolicyRooms;
  roomResolver: RoomResolver;
  clientUserID: StringUserID;
  setRoomMembership: SetRoomMembership;
  setMembership: SetMembershipRevisionIssuer;
  setPoliciesMatchingMembership: SetMembershipPolicyRevision;
  managementRoomOutput: ManagementRoomOutput;
  noop: boolean;
  roomUnbanner: RoomUnbanner;
  unlistedUserRedactionQueue: UnlistedUserRedactionQueue;
  roomInviter: RoomInviter;
};

export const DraupnirUnbanCommand = describeCommand({
  summary: "Removes an entity from a policy list.",
  parameters: tuple({
    name: "entity",
    description:
      "The entity to ban. This can be a user ID, room ID, or server name.",
    acceptor: union(
      MatrixUserIDPresentationType,
      MatrixRoomReferencePresentationSchema,
      StringPresentationType
    ),
  }),
  keywords: {
    keywordDescriptions: {
      // This is a legacy option to unban the user from all rooms that we now ignore just so providing the option doesn't
      // cause an error.
      true: {
        isFlag: true,
        description:
          "Legacy, now redundant option to unban the user from all rooms.",
      },
      invite: {
        isFlag: true,
        description:
          "Re-invite the unbanned user to any rooms they were unbanned from.",
      },
      "no-confirm": {
        isFlag: true,
        description:
          "Runs the command without the preview of the unban and the confirmation prompt.",
      },
    },
  },
  async executor(
    {
      roomInviter,
      roomUnbanner,
      setPoliciesMatchingMembership,
      policyRoomManager,
      watchedPolicyRooms,
      unlistedUserRedactionQueue,
      setRoomMembership,
    }: DraupnirUnbanCommandContext,
    _info,
    keywords,
    _rest,
    entity
  ): Promise<Result<UnbanCommandResult>> {
    const isNoConfirm = keywords.getKeywordValue<boolean>("no-confirm", false);
    const inviteMembers =
      keywords.getKeywordValue<boolean>("invite", false) ?? false;
    if (entity instanceof MatrixUserID) {
      const membersToUnban = findMembersMatchingGlob(
        setRoomMembership,
        new MatrixGlob(entity.toString()),
        { inviteMembers }
      );
      const policyMatchesToRemove = findBanPoliciesMatchingUsers(
        setPoliciesMatchingMembership,
        watchedPolicyRooms,
        membersToUnban.map((memberRooms) => memberRooms.member)
      );
      const unbanInformation = {
        policyMatchesToRemove,
        membersToUnban,
        entity,
      };
      if (!isNoConfirm) {
        return Ok(unbanInformation);
      } else {
        return await unbanMembers(
          unbanInformation,
          {
            roomInviter,
            roomUnbanner,
            policyRoomManager,
            unlistedUserRedactionQueue,
          },
          { inviteMembers }
        );
      }
    } else {
      const unbanPreview = findPoliciesToRemove(
        entity.toString(),
        watchedPolicyRooms
      );
      if (!isNoConfirm) {
        return Ok(unbanPreview);
      } else {
        return await unbanEntity(
          entity.toString(),
          policyRoomManager,
          unbanPreview
        );
      }
    }
  },
});

DraupnirContextToCommandContextTranslator.registerTranslation(
  DraupnirUnbanCommand,
  function (draupnir) {
    return {
      policyRoomManager: draupnir.policyRoomManager,
      watchedPolicyRooms: draupnir.protectedRoomsSet.watchedPolicyRooms,
      roomResolver: draupnir.clientPlatform.toRoomResolver(),
      clientUserID: draupnir.clientUserID,
      setRoomMembership: draupnir.protectedRoomsSet.setRoomMembership,
      setMembership: draupnir.protectedRoomsSet.setMembership,
      setPoliciesMatchingMembership:
        draupnir.protectedRoomsSet.setPoliciesMatchingMembership
          .currentRevision,
      managementRoomOutput: draupnir.managementRoomOutput,
      noop: draupnir.config.noop,
      roomUnbanner: draupnir.clientPlatform.toRoomUnbanner(),
      unlistedUserRedactionQueue: draupnir.unlistedUserRedactionQueue,
      roomInviter: draupnir.clientPlatform.toRoomInviter(),
    };
  }
);

function renderPoliciesToRemove(policyMatches: ListMatches[]): DocumentNode {
  return (
    <fragment>
      The following policies will be removed:
      <ul>
        {policyMatches.map((list) => (
          <li>{renderListRules(list)}</li>
        ))}
      </ul>
    </fragment>
  );
}

function renderUnbanEntityPreview(preview: UnbanEntityPreview): DocumentNode {
  return (
    <fragment>
      You are about to unban the entity {preview.entity.toString()}, do you want
      to continue?
      {renderPoliciesToRemove(preview.policyMatchesToRemove)}
    </fragment>
  );
}

function renderMemberRoomsUnbanPreview(memberRooms: MemberRooms): DocumentNode {
  return (
    <details>
      <summary>
        {renderMentionPill(memberRooms.member, memberRooms.member)} will be
        unbanned from {memberRooms.roomsBannedFrom.length} rooms
      </summary>
      <ul>
        {memberRooms.roomsBannedFrom.map((room) => (
          <li>{renderRoomPill(room)}</li>
        ))}
      </ul>
    </details>
  );
}

function renderMemberRoomsInvitePreview(
  memberRooms: MemberRooms
): DocumentNode {
  if (memberRooms.roomsToInviteTo.length === 0) {
    return <fragment></fragment>;
  }
  return (
    <details>
      <summary>
        {renderMentionPill(memberRooms.member, memberRooms.member)} will be
        invited back to {memberRooms.roomsToInviteTo.length} rooms
      </summary>
      <ul>
        {memberRooms.roomsToInviteTo.map((room) => (
          <li>{renderRoomPill(room)}</li>
        ))}
      </ul>
    </details>
  );
}

function renderMemberRoomsPreview(memberRooms: MemberRooms): DocumentNode {
  return (
    <fragment>
      {renderMemberRoomsUnbanPreview(memberRooms)}
      {renderMemberRoomsInvitePreview(memberRooms)}
    </fragment>
  );
}

function renderUnbanMembersPreview(preview: UnbanMembersPreview): DocumentNode {
  return (
    <fragment>
      {preview.entity.isContainingGlobCharacters() ? (
        <h4>
          You are about to unban users matching the glob{" "}
          <code>{preview.entity.toString()}</code>
        </h4>
      ) : (
        <h4>
          You are about to unban{" "}
          {renderMentionPill(
            preview.entity.toString(),
            preview.entity.toString()
          )}
        </h4>
      )}
      {renderPoliciesToRemove(preview.policyMatchesToRemove)}
      {preview.membersToUnban.length} users will be unbanned:
      {preview.membersToUnban.map(renderMemberRoomsPreview)}
    </fragment>
  );
}

function renderPolicyRemovalResult(result: UnbanEntityResult): DocumentNode {
  if (result.policyRemovalResult.map.size === 0) {
    return <fragment></fragment>;
  }
  return (
    <fragment>
      {renderRoomSetResult(result.policyRemovalResult, {
        summary: <span>Policies were removed from the following rooms:</span>,
      })}
    </fragment>
  );
}

function renderUnbanEntityResult(result: UnbanEntityResult): DocumentNode {
  return (
    <fragment>
      <details>
        <summary>The following policies were found banning this entity</summary>
        {renderPolicyRemovalResult(result)}
      </details>
    </fragment>
  );
}

function renderUnbanMembersResult(result: UnbanMembersResult): DocumentNode {
  return (
    <fragment>
      {renderPolicyRemovalResult(result)}
      {[...result.usersUnbanned.map.entries()].map(([userID, roomSetResult]) =>
        renderRoomSetResult(roomSetResult, {
          summary: (
            <span>
              {renderMentionPill(userID, userID)} was unbanned from{" "}
              {roomSetResult.map.size} rooms:
            </span>
          ),
        })
      )}
      {[...result.usersInvited.map.entries()].map(([userID, roomSetResult]) =>
        renderRoomSetResult(roomSetResult, {
          summary: (
            <span>
              {renderMentionPill(userID, userID)} was invited back to{" "}
              {roomSetResult.map.size} rooms:
            </span>
          ),
        })
      )}
    </fragment>
  );
}

DraupnirInterfaceAdaptor.describeRenderer(DraupnirUnbanCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
  confirmationPromptJSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    } else if ("membersToUnban" in commandResult.ok) {
      return Ok(<root>{renderUnbanMembersPreview(commandResult.ok)}</root>);
    } else {
      return Ok(<root>{renderUnbanEntityPreview(commandResult.ok)}</root>);
    }
  },
  JSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    } else if ("usersUnbanned" in commandResult.ok) {
      return Ok(<root>{renderUnbanMembersResult(commandResult.ok)}</root>);
    } else if ("policyRemovalResult" in commandResult.ok) {
      return Ok(<root>{renderUnbanEntityResult(commandResult.ok)}</root>);
    } else {
      throw new TypeError(
        "The unban command is quite broken you should tell the developers"
      );
    }
  },
});
