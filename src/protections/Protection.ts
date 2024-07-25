// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Protection } from "matrix-protection-suite";
import { DocumentNode } from "../commands/interface-manager/DeadDocument";
import { ParsedKeywords } from "../commands/interface-manager/ParameterParsing";
import { ReadItem } from "../commands/interface-manager/CommandReader";

export interface DraupnirProtection<TProtectionDescription>
  extends Protection<TProtectionDescription> {
  // FIXME: Protections need their own command tables
  // https://github.com/Gnuxie/Draupnir/issues/21/
  status?(
    keywords: ParsedKeywords,
    ...items: ReadItem[]
  ): Promise<DocumentNode>;
}
