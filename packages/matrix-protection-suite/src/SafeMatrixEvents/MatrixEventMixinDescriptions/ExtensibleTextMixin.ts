// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { Type } from "@sinclair/typebox";
import {
  ErroneousEventMixin,
  EventMixinDescription,
  OkEventMixin,
} from "../EventMixinExtraction/EventMixinDescription";
import { ErroneousMixin } from "../EventMixinExtraction/StandardMixinExtractor";
import { hasOwn } from "../hasOwn";
import { Value } from "../../Interface/Value";
import { EDStatic } from "../../Interface/Static";

export type ExtensibleTextMixin = OkEventMixin & {
  representations: { body: string; mimetype: string }[];
};

type ExtensibleTextMixinSchema = EDStatic<typeof ExtensibleTextMixinSchema>;
const ExtensibleTextMixinSchema = Type.Array(
  Type.Object({
    body: Type.String(),
    mimetype: Type.Optional(Type.String()),
  })
);

export const ExtensibleTextMixinDescription = Object.freeze({
  name: "m.text",
  description: "Extracts the m.text mixin from any event",
  properties: ["m.text"],
  parser(content): ExtensibleTextMixin | undefined | ErroneousEventMixin {
    if (!hasOwn(content, "m.text")) {
      return undefined;
    }
    if (!Value.Check(ExtensibleTextMixinSchema, content["m.text"])) {
      return ErroneousMixin(this, "The m.text mixin doesn't match the schema");
    }
    const representations = content["m.text"];
    if (representations.length === 0) {
      // If there are no representations, we don't want people to be under the illusion
      // that this mixin was used, when in reality it's just garbage.
      return undefined;
    }
    return {
      description: this,
      isErroneous: false,
      representations: representations.map((representation) => ({
        body: representation.body,
        mimetype: representation.mimetype ?? "text/plain",
      })),
    };
  },
} satisfies EventMixinDescription<ExtensibleTextMixin, ErroneousEventMixin>);
