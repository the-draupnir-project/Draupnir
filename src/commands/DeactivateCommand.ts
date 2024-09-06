// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import {
  MatrixUserIDPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { ActionError } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const SynapseAdminDeactivateCommand = describeCommand({
  summary: "Deactivate a user on the homeserver.",
  parameters: tuple({
    name: "user",
    description: "The user to deactivate",
    acceptor: MatrixUserIDPresentationType,
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    targetUser
  ): Promise<Result<void>> {
    const isAdmin = await draupnir.synapseAdminClient?.isSynapseAdmin();
    if (isAdmin === undefined || isError(isAdmin) || !isAdmin.ok) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    if (draupnir.synapseAdminClient === undefined) {
      throw new TypeError("Shouldn't be happening at this point");
    }
    await draupnir.synapseAdminClient.deactivateUser(targetUser.toString());
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminDeactivateCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
