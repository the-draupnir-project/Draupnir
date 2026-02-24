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
import { ContentMixins } from "../EventMixinExtraction/EventMixinExtraction";
import { ErroneousMixin } from "../EventMixinExtraction/StandardMixinExtractor";
import { hasOwn } from "../hasOwn";

export type NewContentMixin = OkEventMixin & ContentMixins;

export const NewContentMixinDescription = Object.freeze({
  name: "m.new_content",
  description: "Extracts the m.new_content mixin from any event content",
  properties: ["m.new_content"],
  parser(content, extractor) {
    if (!hasOwn(content, "m.new_content")) {
      return undefined;
    }
    if (
      typeof content["m.new_content"] !== "object" ||
      content["m.new_content"] === null
    ) {
      return ErroneousMixin(
        this,
        "The m.new_content mixin does not match the schema"
      );
    }
    return {
      description: this,
      isErroneous: false,
      ...extractor.parseContent(
        content["m.new_content"] as Record<string, unknown>
      ),
    };
  },
} satisfies EventMixinDescription<NewContentMixin, ErroneousEventMixin>);
