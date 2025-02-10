// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionError,
  ActionResult,
  Ok,
  PolicyListConfig,
  PolicyRoomManager,
  PolicyRuleType,
  PropagationType,
  isError,
} from "matrix-protection-suite";
import { getWatchedPolicyRoomsInfo } from "./StatusCommand";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  BasicInvocationInformation,
  ParsedKeywords,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export async function createList(
  draupnir: Draupnir,
  info: BasicInvocationInformation,
  _keywords: ParsedKeywords,
  _rest: undefined[],
  shortcode: string,
  aliasName: string
): Promise<ActionResult<MatrixRoomID>> {
  const newList = await draupnir.policyRoomManager.createPolicyRoom(
    shortcode,
    // avoids inviting ourself and setting 50 as our own powerlevel
    [info.commandSender].filter((sender) => sender !== draupnir.clientUserID),
    {
      room_alias_name: aliasName,
    }
  );
  if (isError(newList)) {
    return newList;
  }
  const watchResult = await draupnir.protectedRoomsSet.issuerManager.watchList(
    PropagationType.Direct,
    newList.ok,
    {}
  );
  if (isError(watchResult)) {
    return watchResult;
  }
  const protectResult =
    await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(newList.ok);
  if (isError(protectResult)) {
    return protectResult;
  }
  return newList;
}

export const DraupnirListCreateCommand = describeCommand({
  summary:
    "Create a new Policy Room which can be used to ban users, rooms and servers from your protected rooms",
  parameters: tuple(
    {
      name: "shortcode",
      acceptor: StringPresentationType,
    },
    {
      name: "alias name",
      acceptor: StringPresentationType,
    }
  ),
  executor: createList,
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirListCreateCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

export async function findPolicyRoomIDFromShortcode(
  issuerManager: PolicyListConfig,
  policyRoomManager: PolicyRoomManager,
  allJoinedRooms: StringRoomID[],
  protectedRooms: MatrixRoomID[],
  editingClientUserID: StringUserID,
  shortcode: string
): Promise<ActionResult<MatrixRoomID>> {
  const info = await getWatchedPolicyRoomsInfo(
    issuerManager,
    policyRoomManager,
    allJoinedRooms,
    protectedRooms
  );
  if (isError(info)) {
    return info;
  }
  const matchingRevisions = [
    ...info.ok.subscribedAndProtectedLists,
    ...info.ok.subscribedLists,
  ].filter((list) => list.revision.shortcode === shortcode);
  if (matchingRevisions.length === 0 || matchingRevisions[0] === undefined) {
    return ActionError.Result(
      `Could not find a policy room from the shortcode: ${shortcode}`
    );
  } else if (matchingRevisions.length === 1) {
    return Ok(matchingRevisions[0].revision.room);
  } else {
    const remainingRevisions = matchingRevisions.filter((revision) =>
      revision.revision.isAbleToEdit(editingClientUserID, PolicyRuleType.User)
    );
    if (
      remainingRevisions.length !== 1 ||
      remainingRevisions[0] === undefined
    ) {
      return ActionError.Result(
        `The shortcode ${shortcode} is ambiguous and is currently used by ${remainingRevisions.length} lists.`
      );
    } else {
      return Ok(remainingRevisions[0].revision.room);
    }
  }
}
