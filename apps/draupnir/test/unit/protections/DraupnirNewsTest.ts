// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, ResultError } from "@gnuxie/typescript-result";
import {
  DraupnirNewsBlob,
  DraupnirNewsItem,
  DraupnirNewsLifecycle,
} from "../../../src/protections/DraupnirNews/DraupnirNews";
import expect from "expect";

describe("DraupnirNewsTest", function () {
  it("Filesystem news items get sent if the protection hasn't seen them before", async function () {
    const fileSystemNews = {
      news: [
        {
          news_id: "1",
          matrix_event_content: {
            body: "Announcing release v3.0.0!! wohoo",
            msgtype: "m.text",
          },
        },
        {
          news_id: "2",
          matrix_event_content: {
            body: "Draupnir needs your support!",
            msgtype: "m.text",
          },
        },
      ],
    } satisfies DraupnirNewsBlob;
    const remoteNews = {
      news: [
        {
          news_id: "3",
          matrix_event_content: {
            body: "Announcing draupnir news",
            msgtype: "m.text",
          },
        },
      ],
    } satisfies DraupnirNewsBlob;
    const seenNews = new Set<string>();
    const notifiedNews: string[] = [];
    const newsLifecycle = new DraupnirNewsLifecycle(
      seenNews,
      fileSystemNews,
      async (allNews) => {
        allNews.forEach((item) => seenNews.add(item.news_id));
        return Ok(undefined);
      },
      async () => Ok(remoteNews),
      async (item) => {
        notifiedNews.push(item.news_id);
        return Ok(undefined);
      }
    );
    expect(seenNews.size).toBe(0);
    expect(notifiedNews.length).toBe(0);
    await newsLifecycle.checkForNews();
    expect(seenNews.size).toBe(3);
    expect(notifiedNews.length).toBe(3);
    await newsLifecycle.checkForNews();
    expect(notifiedNews.length).toBe(3);
  });
  it("Still works if remote news is inaccessible", async function () {
    const fileSystemNews = {
      news: [
        {
          news_id: "1",
          matrix_event_content: {
            body: "Announcing release v3.0.0!! wohoo",
            msgtype: "m.text",
          },
        },
      ],
    } satisfies DraupnirNewsBlob;
    const seenNews = new Set<string>();
    const notifiedNews: string[] = [];
    const newsLifecycle = new DraupnirNewsLifecycle(
      seenNews,
      fileSystemNews,
      async (allNews) => {
        allNews.forEach((item) => seenNews.add(item.news_id));
        return Ok(undefined);
      },
      async () => ResultError.Result("Can't fetch remote news :("),
      async (item) => {
        notifiedNews.push(item.news_id);
        return Ok(undefined);
      }
    );
    expect(seenNews.size).toBe(0);
    expect(notifiedNews.length).toBe(0);
    await newsLifecycle.checkForNews();
    expect(seenNews.size).toBe(1);
    expect(notifiedNews.length).toBe(1);
    await newsLifecycle.checkForNews();
    expect(notifiedNews.length).toBe(1);
  });
  it("Test news is only stored when there is unseen news", async function () {
    const fileSystemNews = {
      news: [],
    } satisfies DraupnirNewsBlob;
    const seenNews = new Set<string>();
    const storeOperations: DraupnirNewsItem[][] = [];
    const notifiedNews: string[] = [];
    const newsLifecycle = new DraupnirNewsLifecycle(
      seenNews,
      fileSystemNews,
      async (allNews) => {
        allNews.forEach((item) => seenNews.add(item.news_id));
        storeOperations.push(allNews);
        return Ok(undefined);
      },
      async () =>
        Ok({
          news: [
            {
              news_id: "1",
              matrix_event_content: {
                body: "Announcing release v3.0.0!! wohoo",
                msgtype: "m.text",
              },
            },
          ],
        }),
      async (item) => {
        notifiedNews.push(item.news_id);
        return Ok(undefined);
      }
    );
    expect(seenNews.size).toBe(0);
    expect(notifiedNews.length).toBe(0);
    await newsLifecycle.checkForNews();
    expect(seenNews.size).toBe(1);
    expect(notifiedNews.length).toBe(1);
    expect(storeOperations.length).toBe(1);
    await newsLifecycle.checkForNews();
    expect(notifiedNews.length).toBe(1);
    expect(storeOperations.length).toBe(1);
  });
});
