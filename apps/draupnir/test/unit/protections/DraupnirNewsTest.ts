// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok } from "@gnuxie/typescript-result";
import {
  DraupnirNewsItem,
  DraupnirNewsLifecycle,
} from "../../../src/protections/DraupnirNews/DraupnirNews";
import expect from "expect";

describe("DraupnirNewsTest", function () {
  it("Test news is only stored when there is unseen news", async function () {
    const seenNews = new Set<string>();
    const storeOperations: DraupnirNewsItem[][] = [];
    const notifiedNews: string[] = [];
    const newsLifecycle = new DraupnirNewsLifecycle(
      seenNews,
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
