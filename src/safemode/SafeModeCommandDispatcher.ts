// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  CommandPrefixExtractor,
  MatrixInterfaceCommandDispatcher,
  StandardMatrixInterfaceCommandDispatcher,
} from "@the-draupnir-project/interface-manager";
import { SafeModeDraupnir } from "./DraupnirSafeMode";
import {
  MPSCommandDispatcherCallbacks,
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
} from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { userLocalpart } from "@the-draupnir-project/matrix-basic-types";
import { SafeModeCommands } from "./commands/SafeModeCommands";
import { SafeModeHelpCommand } from "./commands/HelpCommand";
import { SafeModeInterfaceAdaptor } from "./commands/SafeModeAdaptor";

function makePrefixExtractor(
  safeModeDraupnir: SafeModeDraupnir
): CommandPrefixExtractor {
  const plainPrefixes = [
    "!draupnir",
    userLocalpart(safeModeDraupnir.clientUserID),
    safeModeDraupnir.clientUserID,
  ];
  const allPossiblePrefixes = [
    ...plainPrefixes.map((p) => `!${p}`),
    ...plainPrefixes.map((p) => `${p}:`),
    ...plainPrefixes,
    ...(safeModeDraupnir.config.commands.allowNoPrefix ? ["!"] : []),
  ];
  return (body) => {
    const isPrefixUsed = allPossiblePrefixes.find((p) =>
      body.toLowerCase().startsWith(p.toLowerCase())
    );
    return isPrefixUsed ? "draupnir" : undefined;
  };
}

export function makeSafeModeCommandDispatcher(
  safeModeDraupnir: SafeModeDraupnir
): MatrixInterfaceCommandDispatcher<MatrixEventContext> {
  return new StandardMatrixInterfaceCommandDispatcher(
    SafeModeInterfaceAdaptor,
    safeModeDraupnir,
    SafeModeCommands,
    SafeModeHelpCommand,
    invocationInformationFromMatrixEventcontext,
    {
      ...MPSCommandDispatcherCallbacks,
      prefixExtractor: makePrefixExtractor(safeModeDraupnir),
    }
  );
}
