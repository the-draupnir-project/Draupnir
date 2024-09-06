// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import {
  CommandTable,
  DeadDocumentJSX,
  DocumentNode,
  ParsedKeywords,
  TopPresentationSchema,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { ActionResult, Ok, isError } from "matrix-protection-suite";
import {
  MatrixAdaptorContext,
  MPSMatrixInterfaceAdaptor,
} from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { AppserviceBotCommands } from "./AppserviceBotCommandTable";
import { renderTableHelp } from "../../commands/interface-manager/MatrixHelpRenderer";

export const AppserviceBotHelpCommand = describeCommand({
  rest: {
    name: "command parts",
    acceptor: TopPresentationSchema,
  },
  summary: "Display this message",
  executor: async function (
    _context: MatrixAdaptorContext,
    _keywords: ParsedKeywords,
    ..._args: unknown[]
  ): Promise<ActionResult<CommandTable>> {
    return Ok(AppserviceBotCommands);
  },
  parameters: [],
});

function renderAppserviceBotHelp(
  appserviceBotCommands: Result<CommandTable>
): Result<DocumentNode> {
  if (isError(appserviceBotCommands)) {
    return appserviceBotCommands;
  }
  return Ok(<root>{renderTableHelp(appserviceBotCommands.ok)}</root>);
}

MPSMatrixInterfaceAdaptor.describeRenderer(AppserviceBotHelpCommand, {
  JSXRenderer: renderAppserviceBotHelp,
});
