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

export type RoomMessageThumbnailURLMixin = OkEventMixin & {
  thumbnail_url: string;
};

export const RoomMessageThumbnailURLMixinDescription = Object.freeze({
  name: "m.room.message thumbnail URL mixin",
  description:
    "Extracts the thumbnail URL mixin from content that looks like m.room.message",
  properties: ["thumbnail_url"],
  parser(content) {
    if (!hasOwn(content, "thumbnail_url")) {
      return undefined;
    }
    if (typeof content.thumbnail_url !== "string") {
      return ErroneousMixin(
        this,
        "The thumbnail URL mixin doesn't match the schema"
      );
    }
    return {
      description: this,
      isErroneous: false,
      thumbnail_url: content.thumbnail_url,
    };
  },
} satisfies EventMixinDescription<
  RoomMessageThumbnailURLMixin,
  ErroneousEventMixin
>);
