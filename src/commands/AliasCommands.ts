// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  findPresentationType,
  parameters,
  ParsedKeywords,
} from "./interface-manager/ParameterParsing";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import {
  ActionError,
  ActionResult,
  isError,
  MatrixRoomAlias,
  MatrixRoomReference,
  Ok,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

// TODO: we should probably add an --admin keyword to these commands
// since they don't actually need admin. Mjolnir had them as admin though.
// then we'd have to call the table "alias table" or something.

defineInterfaceCommand({
  table: "synapse admin",
  designator: ["alias", "move"],
  summary: "Move an alias from one room to another.",
  parameters: parameters([
    {
      name: "alias",
      acceptor: findPresentationType("MatrixRoomAlias"),
      description: "The alias that should be moved.",
    },
    {
      name: "new room",
      acceptor: findPresentationType("MatrixRoomReference"),
      description: "The room to move the alias to.",
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    movingAlias: MatrixRoomAlias,
    room: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const isAdminResult =
      await this.draupnir.synapseAdminClient?.isSynapseAdmin();
    if (
      isAdminResult === undefined ||
      isError(isAdminResult) ||
      !isAdminResult.ok
    ) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    const newRoomID = await resolveRoomReferenceSafe(this.client, room);
    if (isError(newRoomID)) {
      return newRoomID;
    }
    await this.draupnir.client.deleteRoomAlias(movingAlias.toRoomIDOrAlias());
    await this.draupnir.client.createRoomAlias(
      movingAlias.toRoomIDOrAlias(),
      newRoomID.ok.toRoomIDOrAlias()
    );
    return Ok(undefined);
  },
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("synapse admin", "alias", "move"),
  renderer: tickCrossRenderer,
});

defineInterfaceCommand({
  table: "synapse admin",
  designator: ["alias", "add"],
  summary: "Add a new alias to a room.",
  parameters: parameters([
    {
      name: "alias",
      acceptor: findPresentationType("MatrixRoomAlias"),
      description: "The alias that should be created.",
    },
    {
      name: "target room",
      acceptor: findPresentationType("MatrixRoomReference"),
      description: "The room to add the alias to.",
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    movingAlias: MatrixRoomAlias,
    room: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const isAdmin = await this.draupnir.synapseAdminClient?.isSynapseAdmin();
    if (isAdmin === undefined || isError(isAdmin) || !isAdmin.ok) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    const roomID = await resolveRoomReferenceSafe(this.draupnir.client, room);
    if (isError(roomID)) {
      return roomID;
    }
    await this.draupnir.client.createRoomAlias(
      movingAlias.toRoomIDOrAlias(),
      roomID.ok.toRoomIDOrAlias()
    );
    return Ok(undefined);
  },
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("synapse admin", "alias", "add"),
  renderer: tickCrossRenderer,
});

defineInterfaceCommand({
  table: "synapse admin",
  designator: ["alias", "remove"],
  summary: "Removes an alias from a room.",
  parameters: parameters([
    {
      name: "alias",
      acceptor: findPresentationType("MatrixRoomAlias"),
      description: "The alias that should be deleted.",
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    alias: MatrixRoomAlias
  ): Promise<ActionResult<void>> {
    const isAdmin = await this.draupnir.synapseAdminClient?.isSynapseAdmin();
    if (isAdmin === undefined || isError(isAdmin) || !isAdmin.ok) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    await this.draupnir.client.deleteRoomAlias(alias.toRoomIDOrAlias());
    return Ok(undefined);
  },
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("synapse admin", "alias", "remove"),
  renderer: tickCrossRenderer,
});
