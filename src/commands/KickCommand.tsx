/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { MatrixGlob } from "matrix-bot-sdk";
import { DraupnirContext } from "./CommandHandler";
import {
  ActionError,
  ActionResult,
  MatrixRoomReference,
  Ok,
  StringRoomID,
  StringUserID,
  UserID,
  isError,
} from "matrix-protection-suite";
import {
  KeywordsDescription,
  ParsedKeywords,
  findPresentationType,
  parameters,
} from "./interface-manager/ParameterParsing";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DocumentNode } from "./interface-manager/DeadDocument";
import { DeadDocumentJSX } from "./interface-manager/JSXFactory";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";

type UsersToKick = Map<StringUserID, StringRoomID[]>;

function addUserToKick(
  map: UsersToKick,
  roomID: StringRoomID,
  userID: StringUserID
): UsersToKick {
  const userEntry =
    map.get(userID) ?? ((entry) => (map.set(userID, entry), entry))([]);
  userEntry.push(roomID);
  return map;
}

function renderUsersToKick(usersToKick: UsersToKick): DocumentNode {
  return (
    <fragment>
      <details>
        <summary>
          Kicking {usersToKick.size} unique users from protected rooms.
        </summary>
        {[...usersToKick.entries()].map(([userID, rooms]) => (
          <details>
            <summary>
              Kicking {userID} from {rooms.length} rooms.
            </summary>
            <ul>
              {rooms.map((room) => (
                <li>{room}</li>
              ))}
            </ul>
          </details>
        ))}
      </details>
    </fragment>
  );
}

export async function kickCommand(
  this: DraupnirContext,
  keywords: ParsedKeywords,
  user: UserID,
  ...reasonParts: string[]
): Promise<ActionResult<UsersToKick>> {
  const restrictToRoomReference = keywords.getKeyword<MatrixRoomReference>(
    "room",
    undefined
  );
  const isDryRun =
    this.draupnir.config.noop ||
    keywords.getKeyword<string>("dry-run", "false") === "true";
  const allowGlob = keywords.getKeyword<string>("glob", "false");
  const isGlob = user.toString().includes("*") || user.toString().includes("?");
  if (isGlob && !allowGlob) {
    return ActionError.Result(
      "Wildcard bans require an additional argument `--glob` to confirm"
    );
  }
  const restrictToRoom = restrictToRoomReference
    ? await resolveRoomReferenceSafe(this.client, restrictToRoomReference)
    : undefined;
  if (restrictToRoom !== undefined && isError(restrictToRoom)) {
    return restrictToRoom;
  }
  const restrictToRoomRevision =
    restrictToRoom === undefined
      ? undefined
      : this.draupnir.protectedRoomsSet.setMembership.getRevision(
          restrictToRoom.ok.toRoomIDOrAlias()
        );
  const roomsToKickWithin =
    restrictToRoomRevision !== undefined
      ? [restrictToRoomRevision]
      : this.draupnir.protectedRoomsSet.setMembership.allRooms;
  const reason = reasonParts.join(" ");
  const kickRule = new MatrixGlob(user.toString());
  const usersToKick: UsersToKick = new Map();
  for (const revision of roomsToKickWithin) {
    for (const member of revision.members()) {
      if (kickRule.test(member.userID)) {
        addUserToKick(
          usersToKick,
          revision.room.toRoomIDOrAlias(),
          member.userID
        );
      }
      if (!isDryRun) {
        void this.draupnir.taskQueue.push(async () => {
          return this.client.kickUser(
            member.userID,
            revision.room.toRoomIDOrAlias(),
            reason
          );
        });
      }
    }
  }
  return Ok(usersToKick);
}

defineInterfaceCommand({
  designator: ["kick"],
  table: "draupnir",
  parameters: parameters(
    [
      {
        name: "user",
        acceptor: findPresentationType("string"),
      },
    ],
    undefined,
    new KeywordsDescription({
      "dry-run": {
        name: "dry-run",
        isFlag: true,
        acceptor: findPresentationType("boolean"),
        description:
          "Runs the kick command without actually removing any users.",
      },
      glob: {
        name: "glob",
        isFlag: true,
        acceptor: findPresentationType("boolean"),
        description:
          "Allows globs to be used to kick several users from rooms.",
      },
      room: {
        name: "room",
        isFlag: false,
        acceptor: findPresentationType("MatrixRoomReference"),
        description:
          "Allows the command to be scoped to just one protected room.",
      },
    })
  ),
  command: kickCommand,
  summary:
    "Kicks a user or all of those matching a glob in a particular room or all protected rooms. `--glob` must be provided to use globs. Can be scoped to a specific room with `--room`. Can be dry run with `--dry-run`.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "kick"),
  renderer: async function (
    this,
    client,
    commandRoomdID,
    event,
    result: ActionResult<UsersToKick>
  ) {
    tickCrossRenderer.call(this, client, commandRoomdID, event, result);
    if (isError(result)) {
      return;
    }
    await renderMatrixAndSend(
      <root>{renderUsersToKick(result.ok)}</root>,
      commandRoomdID,
      event,
      client
    );
  },
});
