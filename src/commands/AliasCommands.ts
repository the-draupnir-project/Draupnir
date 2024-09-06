// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionResult, isError, Ok } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  describeCommand,
  tuple,
  MatrixRoomAliasPresentationType,
  MatrixRoomReferencePresentationSchema,
} from "@the-draupnir-project/interface-manager";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirAliasMoveCommand = describeCommand({
  summary: "Move an alias from one room to another.",
  parameters: tuple(
    {
      name: "alias",
      description: "The alias that should be moved.",
      acceptor: MatrixRoomAliasPresentationType,
    },
    {
      name: "new room",
      description: "The room to move the alias to.",
      acceptor: MatrixRoomReferencePresentationSchema,
    }
  ),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    aliasToMove,
    newRoom
  ): Promise<ActionResult<void>> {
    const newRoomID = await draupnir.clientPlatform
      .toRoomResolver()
      .resolveRoom(newRoom);
    if (isError(newRoomID)) {
      return newRoomID;
    }
    await draupnir.client.deleteRoomAlias(aliasToMove.toRoomIDOrAlias());
    await draupnir.client.createRoomAlias(
      aliasToMove.toRoomIDOrAlias(),
      newRoomID.ok.toRoomIDOrAlias()
    );
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirAliasMoveCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

export const DraupnirAliasRemoveCommand = describeCommand({
  summary: "Remove an alias from a room.",
  parameters: tuple({
    name: "alias",
    description: "The alias that should be removed.",
    acceptor: MatrixRoomAliasPresentationType,
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    aliasToRemove
  ): Promise<ActionResult<void>> {
    await draupnir.client.deleteRoomAlias(aliasToRemove.toRoomIDOrAlias());
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirAliasRemoveCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
