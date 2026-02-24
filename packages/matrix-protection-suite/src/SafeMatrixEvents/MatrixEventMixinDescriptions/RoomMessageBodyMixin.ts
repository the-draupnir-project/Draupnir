// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import {
  ErroneousEventMixin,
  EventMixinDescription,
  OkEventMixin,
} from "../EventMixinExtraction/EventMixinDescription";
import { ErroneousMixin } from "../EventMixinExtraction/StandardMixinExtractor";
import { hasOwn } from "../hasOwn";

// I've decided that even though Element web uses this method
// to extract mixins.
// The reason we need to do this is because if we go the classical route,
// then it becomes very hard to extract the mixins from events that
// are still rendered by clients but have invalid properties
// or do not specify the correct `msgtype` property.

export type RoomMessagebodyMixin = OkEventMixin & { body: string };

export const RoomMessageBodyMixinDescription = Object.freeze({
  name: "m.room.message body mixin",
  description:
    "Extracts the body property from content that looks like a m.room.message",
  properties: ["body"],
  parser(content) {
    if (!hasOwn(content, "body")) {
      return undefined;
    }
    if (typeof content.body === "string") {
      return {
        description: this,
        isErroneous: false,
        body: content.body,
      };
    }
    return ErroneousMixin(this, "The body property is not a string.");
  },
} satisfies EventMixinDescription<RoomMessagebodyMixin, ErroneousEventMixin>);
