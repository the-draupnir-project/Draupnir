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
  ActionException,
  ActionExceptionKind,
  ActionResult,
  Ok,
  isError,
} from "matrix-protection-suite";
import {
  MatrixRoomID,
  MatrixRoomReference,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  MatrixRoomReferencePresentationSchema,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { Result } from "@gnuxie/typescript-result";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirListProtectedRoomsCommand = describeCommand({
  summary: "List all of the protected rooms.",
  parameters: [],
  async executor({
    protectedRoomsSet,
  }: Draupnir): Promise<Result<MatrixRoomID[]>> {
    return Ok(protectedRoomsSet.allProtectedRooms);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirListProtectedRoomsCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    const rooms = result.ok;
    return Ok(
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
  },
});

export const DraupnirRoomsAddCommand = describeCommand({
  summary:
    "Protect the room using the watched policy lists, banning users and synchronizing server ACL.",
  parameters: tuple({
    name: "room",
    acceptor: MatrixRoomReferencePresentationSchema,
    description: "The room for Draupnir to protect.",
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    roomRef: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const joiner = draupnir.clientPlatform.toRoomJoiner();
    const room = await joiner.joinRoom(roomRef);
    if (isError(room)) {
      return room.elaborate(
        `The homeserver that Draupnir is hosted on cannot join this room using the room reference provided.\
                Try an alias or the "share room" button in your client to obtain a valid reference to the room.`
      );
    }
    return await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
      room.ok
    );
  },
});

export const DraupnirRoomsRemoveCommand = describeCommand({
  summary: "Stop protecting the room and leave.",
  parameters: tuple({
    name: "room",
    acceptor: MatrixRoomReferencePresentationSchema,
    description: "The room to stop protecting.",
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    roomRef: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const room = await draupnir.clientPlatform
      .toRoomResolver()
      .resolveRoom(roomRef);
    if (isError(room)) {
      return room.elaborate(
        `The homeserver that Draupnir is hosted on cannot join this room using the room reference provided.\
                Try an alias or the "share room" button in your client to obtain a valid reference to the room.`
      );
    }
    const removeResult =
      await draupnir.protectedRoomsSet.protectedRoomsManager.removeRoom(
        room.ok
      );
    if (isError(removeResult)) {
      return removeResult;
    }
    try {
      await draupnir.client.leaveRoom(room.ok.toRoomIDOrAlias());
    } catch (exception) {
      return ActionException.Result(
        `Failed to leave ${roomRef.toPermalink()} - the room is no longer being protected, but the bot could not leave.`,
        { exceptionKind: ActionExceptionKind.Unknown, exception }
      );
    }
    return Ok(undefined);
  },
});

for (const command of [DraupnirRoomsAddCommand, DraupnirRoomsRemoveCommand]) {
  DraupnirInterfaceAdaptor.describeRenderer(command, {
    isAlwaysSupposedToUseDefaultRenderer: true,
  });
}
