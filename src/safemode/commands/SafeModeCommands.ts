// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import {
  CommandTable,
  StandardCommandTable,
  TopPresentationSchema,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { Ok } from "matrix-protection-suite";
import { SafeModeInterfaceAdaptor } from "../SafeModeAdaptor";

export const SafeModeCommands = new StandardCommandTable("safe mode");

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
  isAlwaysSupposedToUseDefaultRenderer: true,
});
