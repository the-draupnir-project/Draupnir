// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { RoomEvent } from "../../MatrixTypes/Events";
import {
  randomRoomID,
  randomUserID,
} from "../../TestUtilities/EventGeneration";
import { DefaultMixinExtractor } from "./DefaultMixinExtractor";
import { MentionsMixinDescription } from "./MentionsMixin";
import { RoomMessageBodyMixinDescription } from "./RoomMessageBodyMixin";

test("We can extract ", function () {
  const content = {
    msgtype: "m.text",
    body: "hello world",
    "m.mentions": { user_ids: [randomUserID()] },
  };
  const event = {
    type: "m.room.message",
    sender: randomUserID(),
    room_id: randomRoomID([]).toRoomIDOrAlias(),
    content,
  };
  const decodedEvent = DefaultMixinExtractor.parseEvent(
    event as unknown as RoomEvent
  );
  const mentionsMixin = decodedEvent.findMixin(MentionsMixinDescription);
  if (mentionsMixin === undefined) {
    throw new TypeError(
      "We expect to be able to decode metnions mixin from this event"
    );
  }
  if (mentionsMixin.isErroneous) {
    throw new TypeError("The mentions mixin should not be errorneous");
  }
  expect(mentionsMixin.user_ids.length).toBe(1);
  const bodyMixin = decodedEvent.findMixin(RoomMessageBodyMixinDescription);
  if (bodyMixin === undefined) {
    throw new TypeError("We should be able to get the body mixin");
  }
  if (bodyMixin.isErroneous) {
    throw new TypeError("The body mixin should be fine");
  }
  expect(bodyMixin.body).toBe("hello world");
});
