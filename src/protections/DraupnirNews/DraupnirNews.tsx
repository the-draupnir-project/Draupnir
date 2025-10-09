// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { readFileSync } from "fs";
import { Ok, Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  AbstractProtection,
  ActionException,
  ActionExceptionKind,
  ConstantPeriodBatch,
  describeProtection,
  EDStatic,
  isError,
  Logger,
  MessageContent,
  ProtectedRoomsSet,
  ProtectionDescription,
  RoomMessageSender,
  StandardTimedGate,
  Value,
} from "matrix-protection-suite";
import { Draupnir } from "../../Draupnir";
import { DraupnirProtection } from "../Protection";
import path from "path";

const log = new Logger("DraupnirNews");

// TODO:
// We should probably allow tagging these e.g. to assist making an automated system
// for adding release news.
export type DraupnirNewsItem = EDStatic<typeof DraupnirNewsItem>;
export const DraupnirNewsItem = Type.Object({
  news_id: Type.String({
    description: "An identifier that can be persisted for an item of news.",
  }),
  matrix_event_content: Type.Union([MessageContent], {
    description: "Matrix event content for the news item that can be sent",
  }),
});

export type DraupnirNewsBlob = EDStatic<typeof DraupnirNewsBlob>;
export const DraupnirNewsBlob = Type.Object({
  news: Type.Array(DraupnirNewsItem),
});

const FSNews = (() => {
  const content = JSON.parse(
    readFileSync(path.join(__dirname, "./news.json"), "utf8")
  );
  return Value.Decode(DraupnirNewsBlob, content).expect(
    "File system news should match the schema"
  );
})();

type UpdateSeenNews = (seenNews: DraupnirNewsItem[]) => Promise<Result<void>>;
type FetchNews = (newsURL: string) => Promise<Result<DraupnirNewsBlob>>;

async function fetchNews(newsURL: string): Promise<Result<DraupnirNewsBlob>> {
  return await fetch(newsURL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })
    .then((response) => response.json())
    .then(
      (json) => Value.Decode(DraupnirNewsBlob, json),
      (error) =>
        ActionException.Result("unable to fetch news", {
          exception: error,
          exceptionKind: ActionExceptionKind.Unknown,
        })
    );
}

/**
 * This class manages requests to the Draupnir news endpoint to collect news
 * items. It uses a repository version as a fallback.
 *
 * Lifecycle:
 * - unregisterListeners MUST be called when the parent protection is disposed.
 */
export class DraupnirNewsReader {
  private readonly newsGate = new StandardTimedGate(
    this.requestNews.bind(this),
    this.requestIntervalMS
  );
  private requestLoop: ConstantPeriodBatch;
  public constructor(
    private readonly newsURL: string,
    private readonly fetchNews: FetchNews,
    private readonly updatePreviousNews: UpdateSeenNews,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly managementRoomID: StringRoomID,
    private readonly requestIntervalMS: number,
    private readonly fileSystemNewsBlob: DraupnirNewsBlob,
    private readonly seenNewsIDs: Set<string>
  ) {
    this.newsGate.enqueueOpen();
    this.requestLoop = this.createRequestLoop();
  }

  private createRequestLoop(): ConstantPeriodBatch {
    return new ConstantPeriodBatch(() => {
      this.newsGate.enqueueOpen();
      this.requestLoop = this.createRequestLoop();
    }, this.requestIntervalMS);
  }

  private async requestNews(): Promise<void> {
    const newsBlob = await this.fetchNews(this.newsURL);
    if (isError(newsBlob)) {
      log.error("Unable to fetch news blob", newsBlob.error);
      return;
    }
    await this.notifyOfNews(newsBlob.ok.news);
  }

  private async notifyOfNews(news: DraupnirNewsItem[]): Promise<void> {
    const allNews = new Map(
      [...news, ...this.fileSystemNewsBlob.news].map((item) => [
        item.news_id,
        item,
      ])
    );
    const unseenNews = [...allNews.values()].filter(
      (item) => !this.seenNewsIDs.has(item.news_id)
    );
    const notifiedNews = [...allNews.values()].filter((item) =>
      this.seenNewsIDs.has(item.news_id)
    );
    for (const item of unseenNews) {
      const sendResult = await this.roomMessageSender.sendMessage(
        this.managementRoomID,
        item.matrix_event_content
      );
      if (isError(sendResult)) {
        log.error("Unable to send news to the management room");
      } else {
        notifiedNews.push(item);
      }
    }
    const updateResult = await this.updatePreviousNews(notifiedNews);
    if (isError(updateResult)) {
      log.error("Unable to update stored news", updateResult.error);
      return;
    }
  }

  public unregisterListeners(): void {
    this.newsGate.destroy();
    this.requestLoop.cancel();
  }
}

export const DraupnirNewsProtectionSettings = Type.Object(
  {
    seenNews: Type.Array(Type.String(), {
      default: [],
      uniqueItems: true,
      description: "Any news items that have been seen by the protection.",
    }),
  },
  {
    title: "DraupnirNewsProtectionSettings",
  }
);

export type DraupnirNewsProtectionCapabilities = Record<string, never>;
export type DraupnirNewsProtectionSettings = EDStatic<
  typeof DraupnirNewsProtectionSettings
>;

export type DraupnirNewsDescription = ProtectionDescription<
  Draupnir,
  typeof DraupnirNewsProtectionSettings,
  DraupnirNewsProtectionCapabilities
>;

export class DraupnirNews
  extends AbstractProtection<DraupnirNewsDescription>
  implements DraupnirProtection<DraupnirNewsDescription>
{
  private readonly longhouseCycleNews = new DraupnirNewsReader(
    this.draupnir.config.draupnirNewsURL,
    fetchNews,
    this.updateNews.bind(this),
    this.draupnir.clientPlatform.toRoomMessageSender(),
    this.draupnir.managementRoomID,
    4.32e7, // 12 hours
    FSNews,
    new Set(this.settings.seenNews)
  );
  public constructor(
    description: DraupnirNewsDescription,
    capabilities: DraupnirNewsProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly settings: DraupnirNewsProtectionSettings,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
  }

  private async updateNews(allNews: DraupnirNewsItem[]): Promise<Result<void>> {
    const newSettings = this.description.protectionSettings.toMirror().setValue(
      this.settings,
      "seenNews",
      allNews.map((item) => item.news_id)
    );
    if (isError(newSettings)) {
      return newSettings.elaborate("Unable to set protection settings");
    }
    const result =
      await this.protectedRoomsSet.protections.changeProtectionSettings(
        this.description as unknown as ProtectionDescription,
        this.protectedRoomsSet,
        this.draupnir,
        newSettings.ok
      );
    if (isError(result)) {
      return result.elaborate("Unable to change protection settings");
    }
    return Ok(undefined);
  }

  handleProtectionDisable(): void {
    this.longhouseCycleNews.unregisterListeners();
  }
}

describeProtection<
  DraupnirNewsProtectionCapabilities,
  Draupnir,
  typeof DraupnirNewsProtectionSettings
>({
  name: DraupnirNews.name,
  description: "Provides news about the Draupnir project.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  configSchema: DraupnirNewsProtectionSettings,
  async factory(
    description,
    protectedRoomsSet,
    draupnir,
    capabilities,
    settings
  ) {
    return Ok(
      new DraupnirNews(
        description,
        capabilities,
        protectedRoomsSet,
        settings,
        draupnir
      )
    );
  },
});
