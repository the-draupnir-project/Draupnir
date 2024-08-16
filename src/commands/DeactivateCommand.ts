// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
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
import { DraupnirContext } from "./CommandHandler";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import {
  ActionError,
  ActionResult,
  Ok,
  isError,
} from "matrix-protection-suite";
import { MatrixUserID } from "@the-draupnir-project/matrix-basic-types";

defineInterfaceCommand({
  table: "synapse admin",
  designator: ["deactivate"],
  summary:
    "Deactivates the user on the homeserver, preventing use of the account.",
  parameters: parameters([
    {
      name: "user",
      acceptor: findPresentationType("MatrixUserID"),
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    targetUser: MatrixUserID
  ): Promise<ActionResult<void>> {
    const isAdmin = await this.draupnir.synapseAdminClient?.isSynapseAdmin();
    if (isAdmin === undefined || isError(isAdmin) || !isAdmin.ok) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    if (this.draupnir.synapseAdminClient === undefined) {
      throw new TypeError("Shouldn't be happening at this point");
    }
    await this.draupnir.synapseAdminClient.deactivateUser(
      targetUser.toString()
    );
    return Ok(undefined);
  },
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("synapse admin", "deactivate"),
  renderer: tickCrossRenderer,
});
