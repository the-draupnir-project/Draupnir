/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2021, 2022 Marco Cirillo

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
