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
  PolicyRuleType,
  PropagationType,
  isError,
} from "matrix-protection-suite";
import { DraupnirContext } from "./CommandHandler";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  ParsedKeywords,
  findPresentationType,
  parameters,
} from "./interface-manager/ParameterParsing";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { listInfo } from "./StatusCommand";
import { Draupnir } from "../Draupnir";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";

export async function createList(
  this: DraupnirContext,
  _keywords: ParsedKeywords,
  shortcode: string,
  aliasName: string
): Promise<ActionResult<MatrixRoomID>> {
  const newList = await this.draupnir.policyRoomManager.createPolicyRoom(
    shortcode,
    // avoids inviting ourself and setting 50 as our own powerlevel
    [this.event.sender].filter(
      (sender) => sender !== this.draupnir.clientUserID
    ),
    {
      room_alias_name: aliasName,
    }
  );
  if (isError(newList)) {
    return newList;
  }
  const watchResult =
    await this.draupnir.protectedRoomsSet.issuerManager.watchList(
      PropagationType.Direct,
      newList.ok,
      {}
    );
  if (isError(watchResult)) {
    return watchResult;
  }
  const protectResult =
    await this.draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
      newList.ok
    );
  if (isError(protectResult)) {
    return protectResult;
  }
  return newList;
}

defineInterfaceCommand({
  designator: ["list", "create"],
  table: "draupnir",
  parameters: parameters([
    {
      name: "shortcode",
      acceptor: findPresentationType("string"),
    },
    {
      name: "alias name",
      acceptor: findPresentationType("string"),
    },
  ]),
  command: createList,
  summary:
    "Create a new Policy Room which can be used to ban users, rooms and servers from your protected rooms",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "list", "create"),
  renderer: tickCrossRenderer,
});

export async function findPolicyRoomIDFromShortcode(
  draupnir: Draupnir,
  shortcode: string
): Promise<ActionResult<MatrixRoomID>> {
  const info = await listInfo(draupnir);
  const matchingRevisions = info.filter(
    (list) => list.revision.shortcode === shortcode
  );
  if (matchingRevisions.length === 0 || matchingRevisions[0] === undefined) {
    return ActionError.Result(
      `Could not find a policy room from the shortcode: ${shortcode}`
    );
  } else if (matchingRevisions.length === 1) {
    return Ok(matchingRevisions[0].revision.room);
  } else {
    const remainingRevisions = matchingRevisions.filter((revision) =>
      revision.revision.isAbleToEdit(draupnir.clientUserID, PolicyRuleType.User)
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
