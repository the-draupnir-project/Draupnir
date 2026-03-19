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

export type RoomMessageFileMixin = OkEventMixin & {
  url: string;
  filename: string;
  caption: string | undefined;
};

const FileMediaMixinSchema = Type.Object({
  body: Type.Optional(Type.String()),
  file: Type.Object({
    url: Type.String(),
  }),
  filename: Type.Optional(Type.String()),
});

export const RoomMessageFileMixinDescription = Object.freeze({
  name: "m.room.message file mixin",
  description:
    "Extracts the file mixin from content that looks like m.room.message",
  properties: ["file", "filename", "body"],
  parser(content) {
    if (!hasOwn(content, "file")) {
      return undefined;
    }
    if (Value.Check(FileMediaMixinSchema, content)) {
      const filename = content.filename ?? content.body;
      const caption =
        content.filename !== undefined && content.body !== content.filename
          ? content.body
          : undefined;
      if (filename === undefined) {
        return ErroneousMixin(this, "The filename property is missing.");
      }
      return {
        description: this,
        isErroneous: false,
        filename,
        caption,
        url: content.file.url,
      };
    }
    return ErroneousMixin(this, "The file mixin doesn't match thes chema");
  },
} satisfies EventMixinDescription<RoomMessageFileMixin, ErroneousEventMixin>);
