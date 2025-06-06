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
import { ActionResult, Ok } from "matrix-protection-suite";
import { AppserviceBotCommands } from "./AppserviceBotCommandTable";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotInterfaceAdaptor";
import {
  MatrixAdaptorContext,
  renderTableHelp,
} from "@the-draupnir-project/mps-interface-adaptor";
import { DOCUMENTATION_URL } from "../../config";

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

function renderAppserviceBotHelp(): Result<DocumentNode> {
  return Ok(
    <root>{renderTableHelp(AppserviceBotCommands, DOCUMENTATION_URL)}</root>
  );
}

AppserviceBotInterfaceAdaptor.describeRenderer(AppserviceBotHelpCommand, {
  JSXRenderer: renderAppserviceBotHelp,
});
