// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { MixinExtractor } from "./EventMixinExtraction";

export interface OkEventMixin {
  readonly description: EventMixinDescription<this, ErroneousEventMixin>;
  readonly isErroneous: false;
}

export interface ErroneousEventMixin {
  readonly description: EventMixinDescription<OkEventMixin, this>;
  readonly isErroneous: true;
  readonly message?: string | undefined;
}

export type EventMixin = OkEventMixin | ErroneousEventMixin;

export type EventMixinParser<
  TEventMixinShape extends OkEventMixin,
  TErroneousEventMixinShape extends ErroneousEventMixin,
> = (
  content: Record<string, unknown>,
  extractor: MixinExtractor
) => TEventMixinShape | TErroneousEventMixinShape | undefined;

export type EventMixinDescription<
  TEventMixinShape extends OkEventMixin,
  TErroneousEventMixinShape extends ErroneousEventMixin,
> = Readonly<{
  name: string;
  description: string;
  properties: string[];
  parser: EventMixinParser<TEventMixinShape, TErroneousEventMixinShape>;
}>;

export type ExtractOkMixinFromDescription<T> =
  T extends EventMixinDescription<infer Ok, ErroneousEventMixin> ? Ok : never;

export type ExtractEerrorMixinFromDescription<T> =
  T extends EventMixinDescription<OkEventMixin, infer Err> ? Err : never;
