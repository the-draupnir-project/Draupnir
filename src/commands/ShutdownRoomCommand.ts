// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import {
  MatrixRoomReferencePresentationSchema,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { ActionError } from "matrix-protection-suite";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const SynapseAdminShutdownRoomCommand = describeCommand({
  summary:
    "Prevents access to the the room on this server and sends a message to all users that they have violated the terms of service.",
  parameters: tuple({
    name: "room",
    acceptor: MatrixRoomReferencePresentationSchema,
  }),
  rest: {
    name: "reason",
    acceptor: StringPresentationType,
  },
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    reasonParts,
    targetRoom
  ): Promise<Result<void>> {
    const isAdmin = await draupnir.synapseAdminClient?.isSynapseAdmin();
    if (isAdmin === undefined || isError(isAdmin) || !isAdmin.ok) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to shutdown a room is blocked"
      );
    }
    if (draupnir.synapseAdminClient === undefined) {
      throw new TypeError(`Should be impossible at this point.`);
    }
    const resolvedRoom = await draupnir.clientPlatform
      .toRoomResolver()
      .resolveRoom(targetRoom);
    if (isError(resolvedRoom)) {
      return resolvedRoom;
    }
    const reason = reasonParts.join(" ");
    await draupnir.synapseAdminClient.deleteRoom(
      resolvedRoom.ok.toRoomIDOrAlias(),
      {
        message: reason,
        new_room_user_id: draupnir.clientUserID,
        block: true,
      }
    );
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminShutdownRoomCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
