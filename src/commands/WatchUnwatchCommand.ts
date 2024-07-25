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
  ActionResult,
  MatrixRoomReference,
  PropagationType,
  isError,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

defineInterfaceCommand({
  table: "draupnir",
  designator: ["watch"],
  summary:
    "Watches a list and applies the list's assocated policies to draupnir's protected rooms.",
  parameters: parameters([
    {
      name: "list",
      acceptor: findPresentationType("MatrixRoomReference"),
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    policyRoomReference: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const policyRoom = await resolveRoomReferenceSafe(
      this.client,
      policyRoomReference
    );
    if (isError(policyRoom)) {
      return policyRoom;
    }
    return await this.draupnir.protectedRoomsSet.issuerManager.watchList(
      PropagationType.Direct,
      policyRoom.ok,
      {}
    );
  },
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "watch"),
  renderer: tickCrossRenderer,
});

defineInterfaceCommand({
  table: "draupnir",
  designator: ["unwatch"],
  summary:
    "Unwatches a list and stops applying the list's assocated policies to draupnir's protected rooms.",
  parameters: parameters([
    {
      name: "list",
      acceptor: findPresentationType("MatrixRoomReference"),
    },
  ]),
  command: async function (
    this: DraupnirContext,
    _keywords: ParsedKeywords,
    policyRoomReference: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const policyRoom = await resolveRoomReferenceSafe(
      this.client,
      policyRoomReference
    );
    if (isError(policyRoom)) {
      return policyRoom;
    }
    return await this.draupnir.protectedRoomsSet.issuerManager.unwatchList(
      PropagationType.Direct,
      policyRoom.ok
    );
  },
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "unwatch"),
  renderer: tickCrossRenderer,
});
