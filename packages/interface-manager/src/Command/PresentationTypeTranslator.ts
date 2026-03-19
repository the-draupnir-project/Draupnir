// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Presentation, PresentationTypeWithoutWrap } from "./Presentation";

export type PresentationTypeTranslator<From = unknown, To = unknown> = {
  fromType: PresentationTypeWithoutWrap<From>;
  toType: PresentationTypeWithoutWrap<To>;
  translate(from: Presentation<From>): Presentation<To>;
};

export function describeTranslator<From, To>(
  to: PresentationTypeWithoutWrap<To>,
  from: PresentationTypeWithoutWrap<From>,
  translate: (from: Presentation<From>) => Presentation<To>
): PresentationTypeTranslator<From, To> {
  return {
    fromType: from,
    toType: to,
    translate,
  };
}
