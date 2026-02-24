// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { RoomEvent } from "../../MatrixTypes/Events";
import {
  ErroneousEventMixin,
  EventMixin,
  EventMixinDescription,
  ExtractEerrorMixinFromDescription,
  ExtractOkMixinFromDescription,
  OkEventMixin,
} from "./EventMixinDescription";

// mixins can be nested arbritrarily in other mixins unfortunatly,
// see m.new_content.
export type ContentMixins = Readonly<{
  readonly mixins: EventMixin[];
  readonly additionalProperties: Record<string, unknown>;
  findMixin<
    TDescription extends EventMixinDescription<
      OkEventMixin,
      ErroneousEventMixin
    >,
  >(
    description: TDescription
  ):
    | undefined
    | ExtractOkMixinFromDescription<TDescription>
    | ExtractEerrorMixinFromDescription<TDescription>;
}>;

export type EventWithMixins = Readonly<{
  sourceEvent: RoomEvent;
  // this needs to be here in the situation where the source event is bogus
  // and so we changed its original event type to mark it as undecodable.
  eventType: string;
}> &
  ContentMixins;

export interface MixinExtractor {
  parseContent(content: Record<string, unknown>): ContentMixins;
  parseEvent(event: RoomEvent): EventWithMixins;
}
