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
import { Draupnir } from "../Draupnir";
import {
  MPSCommandDispatcherCallbacks,
  MPSMatrixInterfaceAdaptorCallbacks,
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
} from "@the-draupnir-project/mps-interface-adaptor";

export const DraupnirContextToCommandContextTranslator =
  new StandardAdaptorContextToCommandContextTranslator<Draupnir>();
export const DraupnirInterfaceAdaptor = new StandardMatrixInterfaceAdaptor<
  Draupnir,
  MatrixEventContext
>(
  DraupnirContextToCommandContextTranslator,
  invocationInformationFromMatrixEventcontext,
  MPSMatrixInterfaceAdaptorCallbacks,
  MPSCommandDispatcherCallbacks
);
