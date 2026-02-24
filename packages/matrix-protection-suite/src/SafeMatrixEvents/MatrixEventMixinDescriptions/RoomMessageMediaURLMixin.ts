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

export type RoomMessageMediaURLMixin = OkEventMixin & {
  url: string;
};

export const RoomMessageMediaURLMixinDescription = Object.freeze({
  name: "m.room.message media URL mixin",
  description:
    "Extracts the media URL mixin from content that looks like m.room.message",
  properties: ["url"],
  parser(content) {
    if (!hasOwn(content, "url")) {
      return undefined;
    }
    if (typeof content.url !== "string") {
      return ErroneousMixin(
        this,
        "The mediaURL mixin doesn't match the schema"
      );
    }
    return {
      description: this,
      isErroneous: false,
      url: content.url,
    };
  },
} satisfies EventMixinDescription<
  RoomMessageMediaURLMixin,
  ErroneousEventMixin
>);
