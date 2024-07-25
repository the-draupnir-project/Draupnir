// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  findPresentationType,
  parameters,
} from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { DocumentNode } from "./interface-manager/DeadDocument";
import { DeadDocumentJSX } from "./interface-manager/JSXFactory";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  MatrixRoomID,
  MatrixRoomReference,
  Ok,
  isError,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

defineInterfaceCommand({
  table: "draupnir",
  designator: ["rooms"],
  summary: "List all of the protected rooms.",
  parameters: parameters([]),
  command: async function (
    this: DraupnirContext,
    _keywrods
  ): Promise<ActionResult<MatrixRoomID[]>> {
    return Ok(this.draupnir.protectedRoomsSet.allProtectedRooms);
  },
});

function renderProtectedRooms(rooms: MatrixRoomID[]): DocumentNode {
  return (
    <root>
      <details>
        <summary>
          <b>Protected Rooms ({rooms.length}):</b>
        </summary>
        <ul>
          {rooms.map((r) => (
            <li>
              <a href={r.toPermalink()}>{r.toRoomIDOrAlias()}</a>
            </li>
          ))}
        </ul>
      </details>
    </root>
  );
}

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "rooms"),
  renderer: async function (
    client,
    commandRoomId,
    event,
    result: ActionResult<MatrixRoomID[]>
  ) {
    tickCrossRenderer.call(this, client, commandRoomId, event, result);
    if (isError(result)) {
      return; // tickCrossRenderer will handle it.
    }
    await renderMatrixAndSend(
      renderProtectedRooms(result.ok),
      commandRoomId,
      event,
      client
    );
  },
});

defineInterfaceCommand({
  table: "draupnir",
  designator: ["rooms", "add"],
  summary:
    "Protect the room using the watched policy lists, banning users and synchronizing server ACL.",
  parameters: parameters([
    {
      name: "room",
      acceptor: findPresentationType("MatrixRoomReference"),
      description: "The room to protect.",
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords,
    roomRef: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const joiner = this.clientPlatform.toRoomJoiner();
    const room = await joiner.joinRoom(roomRef);
    if (isError(room)) {
      return room.elaborate(
        `The homeserver that Draupnir is hosted on cannot join this room using the room reference provided.\
                Try an alias or the "share room" button in your client to obtain a valid reference to the room.`
      );
    }
    return await this.draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
      room.ok
    );
  },
});

defineInterfaceCommand({
  table: "draupnir",
  designator: ["rooms", "remove"],
  summary: "Stop protecting the room and leave.",
  parameters: parameters([
    {
      name: "room",
      acceptor: findPresentationType("MatrixRoomReference"),
      description: "The room to stop protecting.",
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords,
    roomRef: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const room = await resolveRoomReferenceSafe(this.client, roomRef);
    if (isError(room)) {
      return room.elaborate(
        `The homeserver that Draupnir is hosted on cannot join this room using the room reference provided.\
                Try an alias or the "share room" button in your client to obtain a valid reference to the room.`
      );
    }
    const removeResult =
      await this.draupnir.protectedRoomsSet.protectedRoomsManager.removeRoom(
        room.ok
      );
    if (isError(removeResult)) {
      return removeResult;
    }
    try {
      await this.client.leaveRoom(room.ok.toRoomIDOrAlias());
    } catch (exception) {
      return ActionException.Result(
        `Failed to leave ${roomRef.toPermalink()} - the room is no longer being protected, but the bot could not leave.`,
        { exceptionKind: ActionExceptionKind.Unknown, exception }
      );
    }
    return Ok(undefined);
  },
});

for (const designator of [
  ["rooms", "add"],
  ["rooms", "remove"],
]) {
  defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("draupnir", ...designator),
    renderer: tickCrossRenderer,
  });
}
