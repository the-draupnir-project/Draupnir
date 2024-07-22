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
