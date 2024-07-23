// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021, 2022 Marco Cirillo
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
  ParsedKeywords,
} from "./interface-manager/ParameterParsing";
import { DraupnirBaseExecutor, DraupnirContext } from "./CommandHandler";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import {
  ActionError,
  ActionResult,
  MatrixRoomReference,
  Ok,
  UserID,
  isError,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

async function hijackRoomCommand(
  this: DraupnirContext,
  _keywords: ParsedKeywords,
  room: MatrixRoomReference,
  user: UserID
): Promise<ActionResult<void>> {
  const isAdmin = await this.draupnir.synapseAdminClient?.isSynapseAdmin();
  if (
    !this.draupnir.config.admin?.enableMakeRoomAdminCommand ||
    isAdmin === undefined ||
    isError(isAdmin) ||
    !isAdmin.ok
  ) {
    return ActionError.Result(
      "Either the command is disabled or Mjolnir is not running as homeserver administrator."
    );
  }
  if (this.draupnir.synapseAdminClient === undefined) {
    throw new TypeError("Should be impossible at this point");
  }
  const resolvedRoom = await resolveRoomReferenceSafe(this.client, room);
  if (isError(resolvedRoom)) {
    return resolvedRoom;
  }
  await this.draupnir.synapseAdminClient.makeUserRoomAdmin(
    resolvedRoom.ok.toRoomIDOrAlias(),
    user.toString()
  );
  return Ok(undefined);
}

defineInterfaceCommand<DraupnirBaseExecutor>({
  designator: ["hijack", "room"],
  table: "synapse admin",
  parameters: parameters([
    {
      name: "room",
      acceptor: findPresentationType("MatrixRoomReference"),
    },
    {
      name: "user",
      acceptor: findPresentationType("UserID"),
    },
  ]),
  command: hijackRoomCommand,
  summary:
    "Make the specified user the admin of a room via the synapse admin API",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("synapse admin", "hijack", "room"),
  renderer: tickCrossRenderer,
});
