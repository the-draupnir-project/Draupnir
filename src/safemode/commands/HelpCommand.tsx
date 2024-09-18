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
import { Ok, isError } from "matrix-protection-suite";
import { renderTableHelp } from "../../commands/interface-manager/MatrixHelpRenderer";
import { safeModeHeader } from "./StatusCommand";

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
  JSXRenderer(result) {
    if (isError(result)) {
      throw new TypeError("This should never fail");
    }
    return Ok(
      <root>
        {safeModeHeader()}
        {renderTableHelp(result.ok)}
      </root>
    );
  },
});
