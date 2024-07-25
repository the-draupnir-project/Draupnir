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
  ActionResult,
  MatrixRoomAlias,
  MatrixRoomID,
  isError,
} from "matrix-protection-suite";
import { DraupnirContext } from "./CommandHandler";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  ParsedKeywords,
  findPresentationType,
  parameters,
} from "./interface-manager/ParameterParsing";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import {
  renderRoomPill,
  tickCrossRenderer,
} from "./interface-manager/MatrixHelpRenderer";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import { DeadDocumentJSX } from "./interface-manager/JSXFactory";

async function resolveAliasCommand(
  this: DraupnirContext,
  _keywords: ParsedKeywords,
  alias: MatrixRoomAlias
): Promise<ActionResult<MatrixRoomID>> {
  return await resolveRoomReferenceSafe(this.client, alias);
}

defineInterfaceCommand({
  table: "draupnir",
  designator: ["resolve"],
  parameters: parameters([
    {
      name: "alias",
      acceptor: findPresentationType("MatrixRoomAlias"),
    },
  ]),
  command: resolveAliasCommand,
  summary: "Resolve a room alias.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "resolve"),
  renderer: async function (
    this,
    client,
    commandRoomID,
    event,
    result: ActionResult<MatrixRoomID>
  ) {
    if (isError(result)) {
      await tickCrossRenderer.call(this, client, commandRoomID, event, result);
      return;
    }
    await renderMatrixAndSend(
      <root>
        <code>{result.ok.toRoomIDOrAlias()}</code> - {renderRoomPill(result.ok)}
      </root>,
      commandRoomID,
      event,
      client
    );
  },
});
