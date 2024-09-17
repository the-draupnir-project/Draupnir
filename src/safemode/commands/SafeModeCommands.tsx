// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import {
  CommandTable,
  DeadDocumentJSX,
  StandardAdaptorContextToCommandContextTranslator,
  StandardCommandTable,
  StandardMatrixInterfaceAdaptor,
  TopPresentationSchema,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { Ok, isError } from "matrix-protection-suite";
import {
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
  MPSMatrixInterfaceAdaptorCallbacks,
  MPSCommandDispatcherCallbacks,
} from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { SafeModeDraupnir } from "../DraupnirSafeMode";
import { renderTableHelp } from "../../commands/interface-manager/MatrixHelpRenderer";

export const SafeModeContextToCommandContextTranslator =
  new StandardAdaptorContextToCommandContextTranslator<SafeModeDraupnir>();

export const SafeModeInterfaceAdaptor = new StandardMatrixInterfaceAdaptor<
  SafeModeDraupnir,
  MatrixEventContext
>(
  SafeModeContextToCommandContextTranslator,
  invocationInformationFromMatrixEventcontext,
  MPSMatrixInterfaceAdaptorCallbacks,
  MPSCommandDispatcherCallbacks
);

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
  JSXRenderer(result) {
    if (isError(result)) {
      throw new TypeError("This should never fail");
    }
    return Ok(<root>{renderTableHelp(result.ok)}</root>);
  },
});
