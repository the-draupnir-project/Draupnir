// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2024 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0

import {
  DefaultMixinExtractor,
  EventWithMixins,
  randomRoomID,
  randomUserID,
  RoomEvent,
} from "matrix-protection-suite";
import { isContainingMentionsOverLimit } from "../../../src/protections/MentionLimitProtection";
import expect from "expect";

function messageEvent(content: {
  body?: string;
  formatted_body?: string;
  "m.mentions"?: { user_ids: string[] };
}): EventWithMixins {
  return DefaultMixinExtractor.parseEvent({
    content,
    type: "m.room.message",
    sender: randomUserID(),
    room_id: randomRoomID([]).toRoomIDOrAlias(),
  } as RoomEvent);
}

describe("MentionLimitProtection test", function () {
  it("Allows normal events", function () {
    expect(
      isContainingMentionsOverLimit(
        messageEvent({ body: "Hello", formatted_body: "Hello" }),
        1,
        true
      )
    ).toBe(false);
  });
  it("Detects mentions in the body", function () {
    expect(
      isContainingMentionsOverLimit(
        messageEvent({ body: "Hello @admin:example.com" }),
        0,
        true
      )
    ).toBe(true);
  });
  it("Detects mentions from m.mentions", function () {
    expect(
      isContainingMentionsOverLimit(
        messageEvent({ "m.mentions": { user_ids: ["@admin:example.com"] } }),
        0,
        true
      )
    ).toBe(true);
  });
  it("Allows mentions under the limit", function () {
    expect(
      isContainingMentionsOverLimit(
        messageEvent({ "m.mentions": { user_ids: ["@admin:example.com"] } }),
        1,
        true
      )
    ).toBe(false);
  });
});
