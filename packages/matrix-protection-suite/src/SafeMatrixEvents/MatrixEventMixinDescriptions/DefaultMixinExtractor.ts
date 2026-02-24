// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { StandardMixinExtractor } from "../EventMixinExtraction/StandardMixinExtractor";
import { ExtensibleTextMixinDescription } from "./ExtensibleTextMixin";
import { MentionsMixinDescription } from "./MentionsMixin";
import { NewContentMixinDescription } from "./NewContentMixin";
import { RoomMessageBodyMixinDescription } from "./RoomMessageBodyMixin";
import { RoomMessageFileMixinDescription } from "./RoomMessageFileMixin";
import { RoomMessageFormattedBodyMixinDescription } from "./RoomMessageFormatedBodyMixin";
import { RoomMessageMediaURLMixinDescription } from "./RoomMessageMediaURLMixin";
import { RoomMessageThumbnailURLMixinDescription } from "./RoomMessageThumbnailURLMixin";

export const DefaultMixinExtractor = new StandardMixinExtractor([
  ExtensibleTextMixinDescription,
  MentionsMixinDescription,
  NewContentMixinDescription,
  RoomMessageBodyMixinDescription,
  RoomMessageFileMixinDescription,
  RoomMessageFormattedBodyMixinDescription,
  RoomMessageMediaURLMixinDescription,
  RoomMessageThumbnailURLMixinDescription,
]);
