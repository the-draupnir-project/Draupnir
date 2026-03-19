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
import { StringUserIDSchema } from "../../MatrixTypes/StringlyTypedMatrix";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

export type MentionsMixin = OkEventMixin & {
  user_ids: StringUserID[];
};

type MentionsContentSchema = EDStatic<typeof MentionsContentSchema>;
const MentionsContentSchema = Type.Object({
  "m.mentions": Type.Object({
    user_ids: Type.Optional(Type.Array(StringUserIDSchema)),
  }),
});

export const MentionsMixinDescription = Object.freeze({
  name: "m.mentions",
  description: "Extracts the m.mentions mixin from any event",
  properties: ["m.mentions"],
  parser(content) {
    if (!hasOwn(content, "m.mentions")) {
      return undefined;
    }
    if (!Value.Check(MentionsContentSchema, content)) {
      return ErroneousMixin(
        this,
        "The m.mentions mixin doesn't match the schema"
      );
    }
    const userIDs = content["m.mentions"]["user_ids"];
    if (userIDs === undefined || userIDs.length === 0) {
      // We don't want to create this mixin when there are no mentions
      // and the client is just emitting garbage.
      return undefined;
    }
    return {
      description: this,
      isErroneous: false,
      user_ids: userIDs,
    };
  },
} satisfies EventMixinDescription<MentionsMixin, ErroneousEventMixin>);
