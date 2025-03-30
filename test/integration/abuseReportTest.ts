// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { strict as assert } from "assert";
import { newTestUser } from "./clientHelper";
import { ABUSE_REPORT_KEY, IReport } from "../../src/report/ReportManager";
import { DraupnirTestContext, draupnirClient } from "./mjolnirSetupUtils";
import {
  NoticeMessageContent,
  ReactionContent,
  ReactionEvent,
  RoomMessage,
  Value,
} from "matrix-protection-suite";
import { StringEventID } from "@the-draupnir-project/matrix-basic-types";

/**
 * Test the ability to turn abuse reports into room messages.
 */

const REPORT_NOTICE_REGEXPS = {
  reporter: /Filed by (?<reporterDisplay>[^ ]*) \((?<reporterId>[^ ]*)\)/,
  accused: /Against (?<accusedDisplay>[^ ]*) \((?<accusedId>[^ ]*)\)/,
  room: /Room (?<roomAliasOrId>[^ ]*)/,
  event: /Event (?<eventId>[^ ]*) Go to event/,
  content: /Content (?<eventContent>.*)/,
  comments: /Comments Comments (?<comments>.*)/,
};

type ReportTemplate = Partial<
  Omit<IReport, "event_id" | "reporter_id" | "accused_id">
> &
  Pick<IReport, "event_id" | "reporter_id" | "accused_id"> & {
    text?: string;
    comment?: string;
    text_prefix?: string;
  };

type UnredactedReaction = Omit<ReactionEvent, "content"> & {
  content: ReactionContent;
};

describe("Test: Reporting abuse", () => {
  // Testing with successive versions of the API.
  //
  // As of this writing, v3 is the standard, while r0 is deprecated. However,
  // both versions are still in use in the wild.
  // Note that this version change only affects the actual URL at which reports
  // are sent.
  for (const endpoint of ["v3", "r0"]) {
    it(
      `Draupnir intercepts abuse reports with endpoint ${endpoint}`,
      async function (this: DraupnirTestContext) {
        this.timeout(90000);
        if (this.draupnir === undefined) {
          throw new TypeError("setup must have failed.");
        }
        const draupnir = this.draupnir;
        const draupnirSyncClient = draupnirClient();
        if (draupnirSyncClient === null) {
          throw new TypeError("setup must have failed.");
        }
        // Listen for any notices that show up.
        const notices: (Omit<RoomMessage, "content"> & {
          content: NoticeMessageContent;
        })[] = [];
        draupnirSyncClient.on("room.event", (roomId, event) => {
          if (roomId === draupnir.managementRoomID) {
            notices.push(event);
          }
        });
        const reactions: UnredactedReaction[] = [];
        draupnirSyncClient.on("room.event", (roomId, event) => {
          if (roomId === draupnir.managementRoomID) {
            if (Value.Check(ReactionContent, event.content)) {
              reactions.push(event);
            }
          }
        });

        // Create a few users and a room.
        const goodUser = await newTestUser(this.config.homeserverUrl, {
          name: { contains: "reporting-abuse-good-user" },
        });
        const badUser = await newTestUser(this.config.homeserverUrl, {
          name: { contains: "reporting-abuse-bad-user" },
        });
        const goodUserId = await goodUser.getUserId();
        const badUserId = await badUser.getUserId();

        const roomId = await goodUser.createRoom({
          invite: [await badUser.getUserId()],
        });
        await goodUser.inviteUser(await badUser.getUserId(), roomId);
        await badUser.joinRoom(roomId);

        console.log("Test: Reporting abuse - send messages");
        // Exchange a few messages.
        const badText = `BAD: ${Math.random()}`; // Will be reported as abuse.
        const badText2 = `BAD: ${Math.random()}`; // Will be reported as abuse.
        const badText3 = `<b>BAD</b>: ${Math.random()}`; // Will be reported as abuse.
        const badText4 = [...Array(1024)]
          .map((_) => `${Math.random()}`)
          .join(""); // Text is too long.
        const badText5 = [...Array(1024)].map((_) => "ABC").join("\n"); // Text has too many lines.
        const badEventId = await badUser.sendText(roomId, badText);
        const badEventId2 = await badUser.sendText(roomId, badText2);
        const badEventId3 = await badUser.sendText(roomId, badText3);
        const badEventId4 = await badUser.sendText(roomId, badText4);
        const badEventId5 = await badUser.sendText(roomId, badText5);
        const badEvent2Comment = `COMMENT: ${Math.random()}`;

        console.log("Test: Reporting abuse - send reports");
        const reportsToFind: ReportTemplate[] = [];

        // Time to report, first without a comment, then with one.
        try {
          await goodUser.doRequest(
            "POST",
            `/_matrix/client/${endpoint}/rooms/${encodeURIComponent(roomId)}/report/${encodeURIComponent(badEventId)}`
          );
          reportsToFind.push({
            reporter_id: goodUserId,
            accused_id: badUserId,
            event_id: badEventId,
            text: badText,
          });
        } catch (e) {
          console.error("Could not send first report", e.body || e);
          throw e;
        }

        try {
          await goodUser.doRequest(
            "POST",
            `/_matrix/client/${endpoint}/rooms/${encodeURIComponent(roomId)}/report/${encodeURIComponent(badEventId2)}`,
            "",
            {
              reason: badEvent2Comment,
            }
          );
          reportsToFind.push({
            reporter_id: goodUserId,
            accused_id: badUserId,
            event_id: badEventId2,
            text: badText2,
            comment: badEvent2Comment,
          });
        } catch (e) {
          console.error("Could not send second report", e.body || e);
          throw e;
        }

        try {
          await goodUser.doRequest(
            "POST",
            `/_matrix/client/${endpoint}/rooms/${encodeURIComponent(roomId)}/report/${encodeURIComponent(badEventId3)}`,
            ""
          );
          reportsToFind.push({
            reporter_id: goodUserId,
            accused_id: badUserId,
            event_id: badEventId3,
            text: badText3,
          });
        } catch (e) {
          console.error("Could not send third report", e.body || e);
          throw e;
        }

        try {
          await goodUser.doRequest(
            "POST",
            `/_matrix/client/${endpoint}/rooms/${encodeURIComponent(roomId)}/report/${encodeURIComponent(badEventId4)}`,
            ""
          );
          reportsToFind.push({
            reporter_id: goodUserId,
            accused_id: badUserId,
            event_id: badEventId4,
            text_prefix: badText4.substring(0, 256),
          });
        } catch (e) {
          console.error("Could not send fourth report", e.body || e);
          throw e;
        }

        try {
          await goodUser.doRequest(
            "POST",
            `/_matrix/client/${endpoint}/rooms/${encodeURIComponent(roomId)}/report/${encodeURIComponent(badEventId5)}`,
            ""
          );
          reportsToFind.push({
            reporter_id: goodUserId,
            accused_id: badUserId,
            event_id: badEventId5,
            text_prefix: badText5.substring(0, 256).split("\n").join(" "),
          });
        } catch (e) {
          console.error("Could not send fifth report", e.body || e);
          throw e;
        }

        console.log("Test: Reporting abuse - wait");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const found: ReportTemplate[] = [];
        for (const toFind of reportsToFind) {
          for (const event of notices) {
            if (Value.Check(RoomMessage, event)) {
              if (
                !(ABUSE_REPORT_KEY in event.content) ||
                typeof event.content[ABUSE_REPORT_KEY] !== "object" ||
                event.content[ABUSE_REPORT_KEY] === null ||
                !("event_id" in event.content[ABUSE_REPORT_KEY]) ||
                typeof event.content[ABUSE_REPORT_KEY].event_id !== "string" ||
                event.content[ABUSE_REPORT_KEY].event_id !== toFind.event_id
              ) {
                // Not a report or not our report.
                continue;
              }
              const report = event.content[ABUSE_REPORT_KEY] as IReport;
              const body = event.content.body;
              let matches: Map<string, RegExpMatchArray> | null = new Map();
              for (const key of Object.keys(
                REPORT_NOTICE_REGEXPS
              ) as (keyof typeof REPORT_NOTICE_REGEXPS)[]) {
                const match = body.match(REPORT_NOTICE_REGEXPS[key]);
                if (match) {
                  console.debug(
                    "We have a match",
                    key,
                    REPORT_NOTICE_REGEXPS[key],
                    match.groups
                  );
                } else {
                  console.debug("Not a match", key, REPORT_NOTICE_REGEXPS[key]);
                  // Not a report, skipping.
                  matches = null;
                  break;
                }
                matches.set(key, match);
              }
              if (!matches) {
                // Not a report, skipping.
                continue;
              }

              assert(
                body.length < 3000,
                `The report shouldn't be too long ${body.length}`
              );
              assert(
                body.split("\n").length < 200,
                "The report shouldn't have too many newlines."
              );

              assert.equal(
                matches.get("event")?.groups?.eventId,
                toFind.event_id,
                "The report should specify the correct event id"
              );

              assert.equal(
                matches.get("reporter")?.groups?.reporterId,
                toFind.reporter_id,
                "The report should specify the correct reporter"
              );
              assert.equal(
                report.reporter_id,
                toFind.reporter_id,
                "The embedded report should specify the correct reporter"
              );
              assert.ok(
                ((reporter: string | undefined) =>
                  reporter !== undefined &&
                  toFind.reporter_id.includes(reporter))(
                  matches.get("reporter")?.groups?.reporterDisplay
                ),
                "The report should display the correct reporter"
              );

              assert.equal(
                matches.get("accused")?.groups?.accusedId,
                toFind.accused_id,
                "The report should specify the correct accused"
              );
              assert.equal(
                report.accused_id,
                toFind.accused_id,
                "The embedded report should specify the correct accused"
              );
              assert.ok(
                ((accused: string | undefined) =>
                  accused !== undefined && toFind.accused_id.includes(accused))(
                  matches.get("accused")?.groups?.accusedDisplay
                ),
                "The report should display the correct reporter"
              );

              if (toFind.text) {
                assert.equal(
                  matches.get("content")?.groups?.eventContent,
                  toFind.text,
                  "The report should contain the text we inserted in the event"
                );
              }
              if (toFind.text_prefix) {
                assert.ok(
                  matches
                    .get("content")
                    ?.groups?.eventContent?.startsWith(toFind.text_prefix),
                  `The report should contain a prefix of the long text we inserted in the event: ${toFind.text_prefix} in? ${matches.get("content")?.groups?.eventContent}`
                );
              }
              if (toFind.comment) {
                assert.equal(
                  matches.get("comments")?.groups?.comments,
                  toFind.comment,
                  "The report should contain the comment we added"
                );
              }
              assert.equal(
                matches.get("room")?.groups?.roomAliasOrId,
                roomId,
                "The report should specify the correct room"
              );
              assert.equal(
                report.room_id,
                roomId,
                "The embedded report should specify the correct room"
              );
              found.push(toFind);
              break;
            }
          }
        }
        assert.deepEqual(found, reportsToFind);

        // Since Draupnir is not a member of the room, the only buttons we should find
        // are `help` and `ignore`.
        for (const event of reactions) {
          const regexp = /\/([[^]]*)\]/;
          const matches = event.content["m.relates_to"]?.["key"]?.match(regexp);
          if (!matches) {
            continue;
          }
          switch (matches[1]) {
            case "bad-report":
            case "help":
              continue;
            default:
              throw new Error(`Didn't expect label ${matches[1]}`);
          }
        }
      } as unknown as Mocha.AsyncFunc
    );
  }
  it("The redact action works", async function (this: DraupnirTestContext) {
    this.timeout(60000);
    const draupnir = this.draupnir;
    const draupnirSyncClient = draupnirClient();
    if (draupnir === undefined || draupnirSyncClient === null) {
      throw new TypeError("setup code didn't work");
    }

    // Listen for any notices that show up.
    const notices: (Omit<RoomMessage, "content"> & {
      content: NoticeMessageContent;
    })[] = [];
    draupnirSyncClient.on("room.event", (roomId, event) => {
      if (roomId === draupnir.managementRoomID) {
        if (Value.Check(NoticeMessageContent, event.content)) {
          notices.push(event);
        }
      }
    });
    const reactions: UnredactedReaction[] = [];
    draupnirSyncClient.on("room.event", (roomId, event) => {
      if (roomId === draupnir.managementRoomID) {
        if (Value.Check(ReactionContent, event.content)) {
          reactions.push(event);
        }
      }
    });

    // Create a moderator.
    const moderatorUser = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "reporting-abuse-moderator-user" },
    });
    await draupnir.client.inviteUser(
      await moderatorUser.getUserId(),
      draupnir.managementRoomID
    );
    await moderatorUser.joinRoom(draupnir.managementRoomID);

    // Create a few users and a room.
    const goodUser = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "reacting-abuse-good-user" },
    });
    const badUser = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "reacting-abuse-bad-user" },
    });

    const roomId = await moderatorUser.createRoom({
      invite: [await badUser.getUserId()],
    });
    await moderatorUser.inviteUser(await goodUser.getUserId(), roomId);
    await moderatorUser.inviteUser(await badUser.getUserId(), roomId);
    await badUser.joinRoom(roomId);
    await goodUser.joinRoom(roomId);

    // Setup Draupnir as moderator for our room.
    await moderatorUser.inviteUser(await draupnir.client.getUserId(), roomId);
    await moderatorUser.setUserPowerLevel(
      await draupnir.client.getUserId(),
      roomId,
      100
    );

    console.log("Test: Reporting abuse - send messages");
    // Exchange a few messages.
    const badText = `BAD: ${Math.random()}`; // Will be reported as abuse.
    const badEventId = await badUser.sendText(roomId, badText);

    console.log("Test: Reporting abuse - send reports");

    try {
      await goodUser.doRequest(
        "POST",
        `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/report/${encodeURIComponent(badEventId)}`
      );
    } catch (e) {
      console.error("Could not send first report", e.body || e);
      throw e;
    }

    console.log("Test: Reporting abuse - wait");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const mjolnirRooms = new Set(await draupnir.client.getJoinedRooms());
    assert.ok(
      mjolnirRooms.has(roomId),
      "Draupnir should be a member of the room"
    );

    // Find the notice
    let noticeId;
    for (const event of notices) {
      if ("content" in event && ABUSE_REPORT_KEY in event.content) {
        if (
          !(ABUSE_REPORT_KEY in event.content) ||
          (event.content[ABUSE_REPORT_KEY] as IReport).event_id !== badEventId
        ) {
          // Not a report or not our report.
          continue;
        }
        noticeId = event.event_id;
        break;
      }
    }
    assert.ok(noticeId, "We should have found our notice");

    // Find the redact button... and click it.
    let redactButtonId: StringEventID | null = null;
    for (const button of reactions) {
      if (
        button.content["m.relates_to"]?.["key"]?.includes("[redact-message]")
      ) {
        redactButtonId = button["event_id"];
        await moderatorUser.sendEvent(
          draupnir.managementRoomID,
          "m.reaction",
          button["content"]
        );
        break;
      }
    }
    assert.ok(redactButtonId, "We should have found the redact button");

    // This should have triggered a confirmation request, with more buttons!
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Find the confirmation prompt
    const confirmationPromptEvent = notices.find((event) =>
      event.content.body.includes("🗍 Redact")
    );
    if (confirmationPromptEvent === undefined) {
      throw new TypeError(`We should have found the confirmation prompt`);
    }
    let confirmEventId = null;
    for (const event of reactions) {
      console.debug("Is this the confirm button?", event);
      const content = event.content;
      if (!Value.Check(ReactionContent, content)) {
        console.debug("Not a reaction");
        continue;
      }
      if (!content["m.relates_to"]?.["key"]?.includes("[confirm]")) {
        console.debug("Not confirm");
        continue;
      }
      if (
        content["m.relates_to"]["event_id"] !== confirmationPromptEvent.event_id
      ) {
        console.debug("Not reaction to redact button");
        continue;
      }

      // It's the confirm button, click it!
      confirmEventId = event["event_id"];
      await moderatorUser.sendEvent(
        draupnir.managementRoomID,
        "m.reaction",
        event["content"]
      );
      break;
    }
    assert.ok(confirmEventId, "We should have found the confirm button");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // This should have redacted the message.
    const newBadEvent = await draupnir.client.getEvent(roomId, badEventId);
    assert.deepEqual(
      Object.keys(newBadEvent.content),
      [],
      "Redaction should have removed the content of the offending event"
    );
  } as unknown as Mocha.AsyncFunc);
});
