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
  CommandNormaliser,
  JSInterfaceCommandDispatcher,
  makeCommandNormaliser,
  MatrixInterfaceCommandDispatcher,
  StandardJSInterfaceCommandDispatcher,
  StandardMatrixInterfaceCommandDispatcher,
} from "@the-draupnir-project/interface-manager";
import {
  MPSCommandDispatcherCallbacks,
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
} from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import { AppserviceBotCommands } from "./AppserviceBotCommandTable";
import { AppserviceBotHelpCommand } from "./AppserviceBotHelp";
import {
  AppserviceBotInterfaceAdaptor,
  AppserviceAdaptorContextToCommandContextTranslator,
} from "./AppserviceBotInterfaceAdaptor";

function makeAppserviceCommandNormaliser(
  appserviceContext: AppserviceAdaptorContext
): CommandNormaliser {
  return makeCommandNormaliser(appserviceContext.clientUserID, {
    symbolPrefixes: ["!"],
    isAllowedOnlySymbolPrefixes: false,
    additionalPrefixes: ["admin"],
    getDisplayName: function (): string {
      // TODO: I don't nkow how we're going to do this yet but we'll
      // figure it out one day.
      return "admin";
    },
    normalisedPrefix: "admin",
  });
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
      commandNormaliser: makeAppserviceCommandNormaliser(appserviceContext),
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
      commandNormaliser: makeAppserviceCommandNormaliser(appserviceContext),
    },
    AppserviceAdaptorContextToCommandContextTranslator
  );
}
