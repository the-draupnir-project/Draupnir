// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  BasicInvocationInformation,
  JSInterfaceCommandDispatcher,
  MatrixInterfaceCommandDispatcher,
  StandardJSInterfaceCommandDispatcher,
  StandardMatrixInterfaceCommandDispatcher,
} from "@the-draupnir-project/interface-manager";
import { SafeModeDraupnir } from "./DraupnirSafeMode";
import {
  MPSCommandDispatcherCallbacks,
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
} from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { SafeModeCommands } from "./commands/SafeModeCommands";
import { SafeModeHelpCommand } from "./commands/HelpCommand";
import {
  SafeModeContextToCommandContextTranslator,
  SafeModeInterfaceAdaptor,
} from "./commands/SafeModeAdaptor";
import { makeDraupnirCommandNormaliser } from "../commands/DraupnirCommandDispatcher";

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
      commandNormaliser: makeDraupnirCommandNormaliser(
        safeModeDraupnir.clientUserID,
        safeModeDraupnir.config
      ),
    }
  );
}

export function makeSafeModeJSDispatcher(
  safeModeDraupnir: SafeModeDraupnir
): JSInterfaceCommandDispatcher<BasicInvocationInformation> {
  return new StandardJSInterfaceCommandDispatcher(
    SafeModeCommands,
    SafeModeHelpCommand,
    safeModeDraupnir,
    {
      ...MPSCommandDispatcherCallbacks,
      commandNormaliser: makeDraupnirCommandNormaliser(
        safeModeDraupnir.clientUserID,
        safeModeDraupnir.config
      ),
    },
    SafeModeContextToCommandContextTranslator
  );
}
