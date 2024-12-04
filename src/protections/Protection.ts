// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { CommandTable } from "@the-draupnir-project/interface-manager";
import { Protection } from "matrix-protection-suite";

export interface DraupnirProtection<TProtectionDescription>
  extends Protection<TProtectionDescription> {
  commandTable?: CommandTable;
}
