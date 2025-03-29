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
  ActionError,
  ActionResult,
  Ok,
  isError,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../../Draupnir";
import { DraupnirInterfaceAdaptor } from "../DraupnirCommandPrerequisites";

export const SynapseAdminHijackRoomCommand = describeCommand({
  summary:
    "Make the specified user the admin of a room via the synapse admin API",
  parameters: tuple(
    {
      name: "room",
      acceptor: MatrixRoomReferencePresentationSchema,
    },
    {
      name: "user",
      acceptor: MatrixUserIDPresentationType,
    }
  ),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    room,
    user
  ): Promise<ActionResult<void>> {
    const isAdmin = await draupnir.synapseAdminClient?.isSynapseAdmin();
    if (
      !draupnir.config.admin?.enableMakeRoomAdminCommand ||
      isAdmin === undefined ||
      isError(isAdmin) ||
      !isAdmin.ok
    ) {
      return ActionError.Result(
        "Either the command is disabled or Draupnir is not running as homeserver administrator."
      );
    }
    if (draupnir.synapseAdminClient === undefined) {
      throw new TypeError("Should be impossible at this point");
    }
    const resolvedRoom = await resolveRoomReferenceSafe(draupnir.client, room);
    if (isError(resolvedRoom)) {
      return resolvedRoom;
    }
    await draupnir.synapseAdminClient.makeUserRoomAdmin(
      resolvedRoom.ok.toRoomIDOrAlias(),
      user.toString()
    );
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminHijackRoomCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
