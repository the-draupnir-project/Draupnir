// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { RoomEvent } from "../../MatrixTypes/Events";
import { UnsafeContentKey } from "../SafeMembershipEvent";
import { isUndecodableEvent } from "../UndecodableEventContent";
import {
  ErroneousEventMixin,
  EventMixin,
  EventMixinDescription,
  ExtractEerrorMixinFromDescription,
  ExtractOkMixinFromDescription,
  OkEventMixin,
} from "./EventMixinDescription";
import {
  MixinExtractor,
  EventWithMixins,
  ContentMixins,
} from "./EventMixinExtraction";

export function extractPrimaryContent(
  event: RoomEvent
): Record<string, unknown> {
  return isUndecodableEvent(event)
    ? (event[UnsafeContentKey] as Record<string, unknown>)
    : event.content;
}

export function extractEventType(event: RoomEvent): string {
  if (isUndecodableEvent(event)) {
    return event.originalType;
  }
  return event.type;
}

export function ErroneousMixin(
  description: EventMixinDescription<OkEventMixin, ErroneousEventMixin>,
  message?: string
): ErroneousEventMixin {
  return {
    description,
    isErroneous: true,
    message,
  };
}

export class StandardMixinExtractor implements MixinExtractor {
  private readonly mixinDescriptions: Set<
    EventMixinDescription<OkEventMixin, ErroneousEventMixin>
  >;

  public constructor(
    mixinDescriptions: EventMixinDescription<
      OkEventMixin,
      ErroneousEventMixin
    >[]
  ) {
    this.mixinDescriptions = new Set(mixinDescriptions);
  }

  public parseContent(content: Record<string, unknown>): ContentMixins {
    const usedPropeties: string[] = [];
    const mixins: EventMixin[] = [];
    for (const description of this.mixinDescriptions) {
      const mixin = description.parser(content, this);
      if (mixin === undefined) {
        continue;
      }
      mixins.push(mixin);
      for (const property of description.properties) {
        usedPropeties.push(property);
      }
    }
    return {
      mixins,
      additionalProperties: Object.fromEntries(
        Object.entries(content).filter(([key]) => !usedPropeties.includes(key))
      ),
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
        | ExtractEerrorMixinFromDescription<TDescription> {
        return this.mixins.find(
          (mixin) => mixin.description === description
        ) as never;
      },
    } satisfies ContentMixins;
  }

  public parseEvent(event: RoomEvent): EventWithMixins {
    const primaryContent = extractPrimaryContent(event);
    const eventType = extractEventType(event);
    const contentMixins = this.parseContent(primaryContent);
    return {
      ...contentMixins,
      sourceEvent: event,
      eventType,
    };
  }
}
