// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  describeCommand,
  MatrixRoomReferencePresentationSchema,
  StringPresentationType,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { StateEvent } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirRoomsStateGetCommand = describeCommand({
  summary: "Introspect on a specific state event",
  parameters: tuple(
    {
      name: "room",
      acceptor: MatrixRoomReferencePresentationSchema,
      description: "The room to introspect on",
    },
    {
      name: "event type",
      acceptor: StringPresentationType,
      description: "The type of matrix state event e.g. m.room.member",
    },
    {
      name: "state key",
      acceptor: StringPresentationType,
      description: "The state_key of the state event we want to introspect on",
    }
  ),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    roomReference,
    stateType,
    stateKey
  ): Promise<Result<StateEvent | undefined>> {
    const room = await draupnir.clientPlatform
      .toRoomResolver()
      .resolveRoom(roomReference);
    if (isError(room)) {
      return room.elaborate("Unable to resolve the room provided.");
    }
    const revision = draupnir.protectedRoomsSet.setRoomState.getRevision(
      room.ok.toRoomIDOrAlias()
    );
    if (!revision) {
      return ResultError.Result(
        `The room ${room.ok.toRoomIDOrAlias()} is not a protected room`
      );
    }
    return Ok(revision.getStateEvent(stateType, stateKey));
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirRoomsStateGetCommand, {
  JSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        <code>{JSON.stringify(commandResult.ok, undefined, 2)}</code>
      </root>
    );
  },
});
