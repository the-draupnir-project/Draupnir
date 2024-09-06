// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import {
  BasicInvocationInformation,
  CommandPrefixExtractor,
  JSInterfaceCommandDispatcher,
  MatrixInterfaceCommandDispatcher,
  StandardAdaptorContextToCommandContextTranslator,
  StandardJSInterfaceCommandDispatcher,
  StandardMatrixInterfaceAdaptor,
  StandardMatrixInterfaceCommandDispatcher,
} from "@the-draupnir-project/interface-manager";
import {
  MPSCommandDispatcherCallbacks,
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
  matrixEventsFromDeadDocument,
  rendererFailedCB,
} from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import {
  promptDefault,
  promptSuggestions,
} from "../../commands/interface-manager/MatrixPromptForAccept";
import { matrixCommandRenderer } from "../../commands/interface-manager/MatrixHelpRenderer";
import { userLocalpart } from "@the-draupnir-project/matrix-basic-types";
import { AppserviceBotCommands } from "./AppserviceBotCommandTable";
import { AppserviceBotHelpCommand } from "./AppserviceBotHelp";

export const AppserviceAdaptorContextToCommandContextTranslator =
  new StandardAdaptorContextToCommandContextTranslator<AppserviceAdaptorContext>();

export const AppserviceBotInterfaceAdaptor = new StandardMatrixInterfaceAdaptor<
  AppserviceAdaptorContext,
  MatrixEventContext
>(
  AppserviceAdaptorContextToCommandContextTranslator,
  invocationInformationFromMatrixEventcontext,
  promptDefault,
  promptSuggestions,
  matrixCommandRenderer,
  matrixEventsFromDeadDocument,
  rendererFailedCB
);

function makePrefixExtractor(
  appserviceContext: AppserviceAdaptorContext
): CommandPrefixExtractor {
  const plainPrefixes = [
    "admin",
    userLocalpart(appserviceContext.clientUserID),
    appserviceContext.clientUserID,
  ];
  const allPossiblePrefixes = [
    ...plainPrefixes.map((p) => `!${p}`),
    ...plainPrefixes.map((p) => `${p}:`),
    ...plainPrefixes,
  ];
  return (body) => {
    const isPrefixUsed = allPossiblePrefixes.find((p) =>
      body.toLowerCase().startsWith(p.toLowerCase())
    );
    return isPrefixUsed ? "admin" : undefined;
  };
}

export function makeAppserviceBotCommandDispatcher(
  appserviceContext: AppserviceAdaptorContext
): MatrixInterfaceCommandDispatcher<MatrixEventContext> {
  return new StandardMatrixInterfaceCommandDispatcher(
    AppserviceBotInterfaceAdaptor,
    appserviceContext,
    AppserviceBotCommands,
    AppserviceBotHelpCommand,
    invocationInformationFromMatrixEventcontext,
    {
      ...MPSCommandDispatcherCallbacks,
      prefixExtractor: makePrefixExtractor(appserviceContext),
    }
  );
}

export function makeAppserviceJSCommandDispatcher(
  appserviceContext: AppserviceAdaptorContext
): JSInterfaceCommandDispatcher<BasicInvocationInformation> {
  return new StandardJSInterfaceCommandDispatcher(
    AppserviceBotCommands,
    AppserviceBotHelpCommand,
    appserviceContext,
    {
      ...MPSCommandDispatcherCallbacks,
      prefixExtractor: makePrefixExtractor(appserviceContext),
    },
    AppserviceAdaptorContextToCommandContextTranslator
  );
}
