// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { MatrixAdaptorContext } from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { MjolnirAppService } from "../AppService";

export interface AppserviceAdaptorContext extends MatrixAdaptorContext {
  appservice: MjolnirAppService;
}
