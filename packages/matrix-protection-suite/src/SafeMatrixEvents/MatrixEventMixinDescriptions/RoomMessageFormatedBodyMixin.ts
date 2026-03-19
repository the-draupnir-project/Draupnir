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

export type RoomMessageFormattedBodyMixin = OkEventMixin & {
  formatted_body: string;
  format: string;
};

export const RoomMessageFormattedBodyMixinDescription = Object.freeze({
  name: "m.room.message formatted_body mixin",
  description:
    "Extracts the formatted_body property and the format property from content that looks like a m.room.message",
  properties: ["formatted_body", "format"],
  parser(content) {
    if (!hasOwn(content, "formatted_body")) {
      return undefined;
    }
    if (
      typeof content.formatted_body === "string" &&
      hasOwn(content, "format") &&
      typeof content.format === "string"
    ) {
      return {
        description: this,
        isErroneous: false,
        formatted_body: content.formatted_body,
        format: content.format,
      };
    }
    return ErroneousMixin(this, "The body property is not a string.");
  },
} satisfies EventMixinDescription<
  RoomMessageFormattedBodyMixin,
  ErroneousEventMixin
>);
