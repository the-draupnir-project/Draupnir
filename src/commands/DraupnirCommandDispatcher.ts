// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import {
  MatrixInterfaceCommandDispatcher,
  StandardMatrixInterfaceCommandDispatcher,
  CommandPrefixExtractor,
  JSInterfaceCommandDispatcher,
  BasicInvocationInformation,
  StandardJSInterfaceCommandDispatcher,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import {
  MPSCommandDispatcherCallbacks,
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
} from "./interface-manager/MPSMatrixInterfaceAdaptor";
import { DraupnirHelpCommand } from "./Help";
import { userLocalpart } from "@the-draupnir-project/matrix-basic-types";
import { DraupnirTopLevelCommands } from "./DraupnirCommandTable";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";
import "./DraupnirCommands";

function makePrefixExtractor(draupnir: Draupnir): CommandPrefixExtractor {
  const plainPrefixes = [
    "!draupnir",
    userLocalpart(draupnir.clientUserID),
    draupnir.clientUserID,
    ...draupnir.config.commands.additionalPrefixes,
  ];
  const allPossiblePrefixes = [
    ...plainPrefixes.map((p) => `!${p}`),
    ...plainPrefixes.map((p) => `${p}:`),
    ...plainPrefixes,
    ...(draupnir.config.commands.allowNoPrefix ? ["!"] : []),
  ];
  return (body) => {
    const isPrefixUsed = allPossiblePrefixes.find((p) =>
      body.toLowerCase().startsWith(p.toLowerCase())
    );
    return isPrefixUsed ? "draupnir" : undefined;
  };
}

export function makeDraupnirCommandDispatcher(
  draupnir: Draupnir
): MatrixInterfaceCommandDispatcher<MatrixEventContext> {
  return new StandardMatrixInterfaceCommandDispatcher(
    DraupnirInterfaceAdaptor,
    draupnir,
    DraupnirTopLevelCommands,
    DraupnirHelpCommand,
    invocationInformationFromMatrixEventcontext,
    {
      ...MPSCommandDispatcherCallbacks,
      prefixExtractor: makePrefixExtractor(draupnir),
    }
  );
}

export function makeDraupnirJSCommandDispatcher(
  draupnir: Draupnir
): JSInterfaceCommandDispatcher<BasicInvocationInformation> {
  return new StandardJSInterfaceCommandDispatcher(
    DraupnirTopLevelCommands,
    DraupnirHelpCommand,
    draupnir,
    {
      ...MPSCommandDispatcherCallbacks,
      prefixExtractor: makePrefixExtractor(draupnir),
    },
    DraupnirContextToCommandContextTranslator
  );
}
