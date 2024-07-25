// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionError, ActionResult } from "matrix-protection-suite";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  ParsedKeywords,
  parameters,
} from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";

defineInterfaceCommand({
  designator: ["verify"],
  table: "draupnir",
  parameters: parameters([]),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords
  ): Promise<ActionResult<unknown>> {
    const enabledProtection =
      this.draupnir.protectedRoomsSet.protections.allProtections;
    const eventPermissions = new Set<string>();
    const permissions = new Set<string>();
    for (const proteciton of enabledProtection) {
      proteciton.requiredEventPermissions.forEach((permission) =>
        eventPermissions.add(permission)
      );
      proteciton.requiredPermissions.forEach((permission) =>
        permissions.add(permission)
      );
    }
    // FIXME do we need something like setMembership but for room state?
    // Not sure if it will work because sometimes you need room state of watched lists too.
    // Should be considered with the appservice to effect visibility of rooms.
    return ActionError.Result(`Unimplemented`);
  },
  summary: "Verify the permissions that draupnir has.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "verify"),
  renderer: tickCrossRenderer,
});
