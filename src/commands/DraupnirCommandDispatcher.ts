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
  JSInterfaceCommandDispatcher,
  BasicInvocationInformation,
  StandardJSInterfaceCommandDispatcher,
  CommandNormaliser,
  makeCommandNormaliser,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import {
  MPSCommandDispatcherCallbacks,
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
} from "./interface-manager/MPSMatrixInterfaceAdaptor";
import { DraupnirHelpCommand } from "./Help";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { DraupnirTopLevelCommands } from "./DraupnirCommandTable";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";
import "./DraupnirCommands";
import { IConfig } from "../config";

export function makeDraupnirCommandNormaliser(
  clientUserID: StringUserID,
  config: IConfig
): CommandNormaliser {
  return makeCommandNormaliser(clientUserID, {
    symbolPrefixes: ["!"],
    isAllowedOnlySymbolPrefixes: config.commands.allowNoPrefix,
    additionalPrefixes: ["draupnir", ...config.commands.additionalPrefixes],
    getDisplayName: function (): string {
      // TODO: We'll have the displayname cached somewhere one day and dynamically updated.
      return "draupnir";
    },
    normalisedPrefix: "draupnir",
  });
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
      commandNormaliser: makeDraupnirCommandNormaliser(
        draupnir.clientUserID,
        draupnir.config
      ),
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
      commandNormaliser: makeDraupnirCommandNormaliser(
        draupnir.clientUserID,
        draupnir.config
      ),
    },
    DraupnirContextToCommandContextTranslator
  );
}
