// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  StandardAdaptorContextToCommandContextTranslator,
  StandardMatrixInterfaceAdaptor,
} from "@the-draupnir-project/interface-manager";
import {
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
  MPSMatrixInterfaceAdaptorCallbacks,
  MPSCommandDispatcherCallbacks,
} from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { SafeModeDraupnir } from "../DraupnirSafeMode";

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
