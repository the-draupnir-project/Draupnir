// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixGlob } from "matrix-bot-sdk";
import { DraupnirContext } from "./CommandHandler";
import {
  ActionError,
  ActionResult,
  Ok,
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
import {
  StringUserID,
  StringRoomID,
  MatrixRoomReference,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";

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
  user: MatrixUserID,
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
        acceptor: findPresentationType("MatrixUserID"),
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
