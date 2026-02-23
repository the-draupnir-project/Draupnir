// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { SafeModeCommands } from "./SafeModeCommands";
import { SafeModeInterfaceAdaptor } from "./SafeModeAdaptor";

import { Result } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  describeCommand,
  TopPresentationSchema,
  CommandTable,
} from "@the-draupnir-project/interface-manager";
import { Ok } from "matrix-protection-suite";
import { renderTableHelp } from "@the-draupnir-project/mps-interface-adaptor";
import { safeModeHeader } from "./StatusCommand";
import { DOCUMENTATION_URL } from "../../config";

export const SafeModeHelpCommand = describeCommand({
  rest: {
    name: "command parts",
    acceptor: TopPresentationSchema,
  },
  summary: "Display this message",
  executor: async function (
    _context,
    _keywords
  ): Promise<Result<CommandTable>> {
    return Ok(SafeModeCommands);
  },
  parameters: [],
});

SafeModeInterfaceAdaptor.describeRenderer(SafeModeHelpCommand, {
  JSXRenderer() {
    return Ok(
      <root>
        {safeModeHeader()}
        {renderTableHelp(SafeModeCommands, DOCUMENTATION_URL)}
      </root>
    );
  },
});
