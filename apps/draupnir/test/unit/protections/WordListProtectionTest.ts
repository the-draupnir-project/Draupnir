// SPDX-FileCopyrightText: 2026 soupslurpr
//
// SPDX-License-Identifier: Apache-2.0

import {
  DefaultMixinExtractor,
  EventConsequences,
  findProtection,
  isError,
  Ok,
  ProtectedRoomsSet,
  randomEventID,
  randomRoomID,
  randomUserID,
  StandardLifetime,
  UserConsequences,
} from "@the-draupnir-project/matrix-protection-suite";
import { createMock } from "ts-auto-mock";
import expect from "expect";
import { Draupnir } from "../../../src/Draupnir";
import "../../../src/protections/WordList";

async function handleMessage(
  content: Record<string, unknown>,
  words: string[] = ["blocked", "other"]
) {
  const room = randomRoomID([]);
  const roomID = room.toRoomIDOrAlias();
  const managementRoomID = randomRoomID([]).toRoomIDOrAlias();
  const sender = randomUserID();
  const eventID = randomEventID();
  const notifications: { roomID: string; content: unknown }[] = [];
  const bans: Parameters<UserConsequences["consequenceForUserInRoom"]>[] = [];
  const redactions: Parameters<EventConsequences["consequenceForEvent"]>[] = [];
  const description = findProtection("WordListProtection");
  if (description === undefined) {
    throw new TypeError("WordListProtection is not registered");
  }
  const protectionResult = await description.factory(
    description,
    new StandardLifetime(),
    createMock<ProtectedRoomsSet>(),
    createMock<Draupnir>({
      clientUserID: randomUserID(),
      managementRoomID,
      config: {
        protections: {
          wordlist: {
            words,
            minutesBeforeTrusting: 0,
          },
        },
      },
      client: {
        async sendMessage(roomID, content) {
          notifications.push({ roomID, content });
          return randomEventID();
        },
      },
    }),
    {
      userConsequences: createMock<UserConsequences>({
        async consequenceForUserInRoom(...args) {
          bans.push(args);
          return Ok(undefined);
        },
      }),
      eventConsequences: createMock<EventConsequences>({
        async consequenceForEvent(...args) {
          redactions.push(args);
          return Ok(undefined);
        },
      }),
    },
    {}
  );
  if (isError(protectionResult)) {
    throw new Error(protectionResult.error.toReadableString());
  }
  const protection = protectionResult.ok;
  if (protection.handleTimelineEventMixins === undefined) {
    throw new TypeError("WordListProtection has no timeline event handler");
  }
  protection.handleTimelineEventMixins(
    room,
    DefaultMixinExtractor.parseEvent({
      type: "m.room.message",
      sender,
      room_id: roomID,
      event_id: eventID,
      origin_server_ts: 0,
      content,
    })
  );
  // Let the background task finish its mocked ban, notification and redaction.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await protection[Symbol.asyncDispose]();
  return {
    roomID,
    managementRoomID,
    sender,
    eventID,
    notifications,
    bans,
    redactions,
  };
}

describe("WordListProtection", function () {
  const cases = [
    {
      name: "Reports the matched substring in a quoted plain-text message",
      content: { body: "> quoted text\nThis is unBLOCKED text." },
    },
    {
      name: "Reports a match found only in the formatted body",
      content: {
        body: "Nothing to match here",
        format: "org.matrix.custom.html",
        formatted_body: "<p>BLOCKED</p>",
      },
    },
    {
      name: "Reports a match in a later extensible text representation",
      content: {
        "m.text": [
          { body: "Nothing to match here" },
          { body: "<p>BLOCKED</p>", mimetype: "text/html" },
        ],
      },
    },
    {
      name: "Reports the first matching body when multiple bodies match",
      content: {
        body: "> BLOCKED",
        format: "org.matrix.custom.html",
        formatted_body: "<p>other</p>",
      },
    },
    {
      name: "Matches configured words when empty entries are also present",
      content: { body: "> BLOCKED" },
      words: ["", "blocked", ""],
    },
  ];
  for (const { name, content, words } of cases) {
    it(name, async function () {
      const result = await handleMessage(content, words);
      expect(result.notifications).toEqual([
        {
          roomID: result.managementRoomID,
          content: {
            msgtype: "m.notice",
            body: `Banned ${result.sender} in ${result.roomID} for saying 'BLOCKED'.`,
          },
        },
      ]);
      const reason =
        "Said a bad word. Moderators, consult the management room for more information.";
      expect(result.bans).toEqual([[result.roomID, result.sender, reason]]);
      expect(result.redactions).toEqual([
        [result.roomID, result.eventID, reason],
      ]);
    });
  }

  it("Does not ban, notify or redact when no body matches", async function () {
    const result = await handleMessage({
      body: "Nothing to match here",
      format: "org.matrix.custom.html",
      formatted_body: "<p>Nothing to match here</p>",
      "m.text": [{ body: "Nothing to match here" }],
    });
    expect(result.notifications).toEqual([]);
    expect(result.bans).toEqual([]);
    expect(result.redactions).toEqual([]);
  });

  for (const words of [[], [""]]) {
    for (const body of ["", "ordinary text"]) {
      it(`Does not take action with word list ${JSON.stringify(words)} and body ${JSON.stringify(body)}`, async function () {
        const result = await handleMessage(
          {
            body,
            format: "org.matrix.custom.html",
            formatted_body: "<p>BLOCKED</p>",
            "m.text": [{ body: "other" }],
          },
          words
        );
        expect(result.notifications).toEqual([]);
        expect(result.bans).toEqual([]);
        expect(result.redactions).toEqual([]);
      });
    }
  }
});
