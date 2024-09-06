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
  MatrixEventContext,
  invocationInformationFromMatrixEventcontext,
  matrixEventsFromDeadDocument,
  rendererFailedCB,
} from "./interface-manager/MPSMatrixInterfaceAdaptor";
import { matrixCommandRenderer } from "./interface-manager/MatrixHelpRenderer";
import {
  promptDefault,
  promptSuggestions,
} from "./interface-manager/MatrixPromptForAccept";

export const DraupnirContextToCommandContextTranslator =
  new StandardAdaptorContextToCommandContextTranslator<Draupnir>();
export const DraupnirInterfaceAdaptor = new StandardMatrixInterfaceAdaptor<
  Draupnir,
  MatrixEventContext
>(
  DraupnirContextToCommandContextTranslator,
  invocationInformationFromMatrixEventcontext,
  promptDefault,
  promptSuggestions,
  matrixCommandRenderer,
  matrixEventsFromDeadDocument,
  rendererFailedCB
);
