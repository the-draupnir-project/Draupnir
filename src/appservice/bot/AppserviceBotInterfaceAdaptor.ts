// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

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
import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";

export const AppserviceAdaptorContextToCommandContextTranslator =
  new StandardAdaptorContextToCommandContextTranslator<AppserviceAdaptorContext>();

export const AppserviceBotInterfaceAdaptor = new StandardMatrixInterfaceAdaptor<
  AppserviceAdaptorContext,
  MatrixEventContext
>(
  AppserviceAdaptorContextToCommandContextTranslator,
  invocationInformationFromMatrixEventcontext,
  MPSMatrixInterfaceAdaptorCallbacks,
  MPSCommandDispatcherCallbacks
);
