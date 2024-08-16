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
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  findPresentationType,
  parameters,
  ParsedKeywords,
  RestDescription,
} from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import {
  ActionError,
  ActionResult,
  Ok,
  isError,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { MatrixRoomReference } from "@the-draupnir-project/matrix-basic-types";

defineInterfaceCommand({
  table: "synapse admin",
  designator: ["shutdown", "room"],
  summary:
    "Prevents access to the the room on this server and sends a message to all users that they have violated the terms of service.",
  parameters: parameters(
    [
      {
        name: "room",
        acceptor: findPresentationType("MatrixRoomReference"),
      },
    ],
    new RestDescription("reason", findPresentationType("string"))
  ),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    targetRoom: MatrixRoomReference,
    ...reasonParts: string[]
  ): Promise<ActionResult<void>> {
    const isAdmin = await this.draupnir.synapseAdminClient?.isSynapseAdmin();
    if (isAdmin === undefined || isError(isAdmin) || !isAdmin.ok) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to shutdown a room is blocked"
      );
    }
    if (this.draupnir.synapseAdminClient === undefined) {
      throw new TypeError(`Should be impossible at this point.`);
    }
    const resolvedRoom = await resolveRoomReferenceSafe(
      this.client,
      targetRoom
    );
    if (isError(resolvedRoom)) {
      return resolvedRoom;
    }
    const reason = reasonParts.join(" ");
    await this.draupnir.synapseAdminClient.deleteRoom(
      resolvedRoom.ok.toRoomIDOrAlias(),
      {
        message: reason,
        new_room_user_id: this.draupnir.clientUserID,
        block: true,
      }
    );
    return Ok(undefined);
  },
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("synapse admin", "shutdown", "room"),
  renderer: tickCrossRenderer,
});
