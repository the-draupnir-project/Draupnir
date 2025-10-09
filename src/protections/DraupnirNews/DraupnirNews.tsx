// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { readFileSync } from "fs";
import { isOk, Ok, Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
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

export const DraupnirNewsHelper = Object.freeze({
  mergeSources(...blobs: DraupnirNewsBlob[]): DraupnirNewsItem[] {
    return [
      ...new Map(
        blobs
          .reduce<DraupnirNewsItem[]>((acc, blob) => [...acc, ...blob.news], [])
          .map((item) => [item.news_id, item])
      ).values(),
    ];
  },
  removeSeenNews(news: DraupnirNewsItem[], seenNewsIDs: Set<string>) {
    return news.filter((item) => !seenNewsIDs.has(item.news_id));
  },
  removeUnseenNews(news: DraupnirNewsItem[], seenNewsIDs: Set<string>) {
    return news.filter((item) => seenNewsIDs.has(item.news_id));
  },
});

export type StoreSeenNews = (
  seenNews: DraupnirNewsItem[]
) => Promise<Result<void>>;
export type FetchRemoteNews = () => Promise<Result<DraupnirNewsBlob>>;
export type NotifyNewsItem = (item: DraupnirNewsItem) => Promise<Result<void>>;

/**
 * This class manages requesting news from upstream, notifying, and storing
 * the newly seen news. Once seen news is updated, the instance should be
 * disposed.
 */
export class DraupnirNewsLifecycle {
  public constructor(
    private readonly seenNewsIDs: Set<string>,
    private readonly localNews: DraupnirNewsBlob,
    private readonly storeNews: StoreSeenNews,
    private readonly fetchRemoteNews: FetchRemoteNews,
    private readonly notifyNewsItem: NotifyNewsItem
  ) {
    // nothing to do.
  }

  public async checkForNews(): Promise<void> {
    const remoteNews = await this.fetchRemoteNews();
    if (isError(remoteNews)) {
      log.error("Unable to fetch news blob", remoteNews.error);
      // fall through, we still want to be able to show filesystem news.
    }
    const allNews = DraupnirNewsHelper.mergeSources(
      this.localNews,
      isOk(remoteNews) ? remoteNews.ok : { news: [] }
    );
    const unseenNews = DraupnirNewsHelper.removeSeenNews(
      allNews,
      this.seenNewsIDs
    );
    const notifiedNews = DraupnirNewsHelper.removeUnseenNews(
      allNews,
      this.seenNewsIDs
    );
    for (const item of unseenNews) {
      const sendResult = await this.notifyNewsItem(item);
      if (isError(sendResult)) {
        log.error("Unable to notify of news item");
      } else {
        notifiedNews.push(item);
      }
    }
    const updateResult = await this.storeNews(notifiedNews);
    if (isError(updateResult)) {
      log.error("Unable to update stored news", updateResult.error);
      return;
    }
  }
}

const FSNews = (() => {
  const content = JSON.parse(
    readFileSync(path.join(__dirname, "./news.json"), "utf8")
  );
  return Value.Decode(DraupnirNewsBlob, content).expect(
    "File system news should match the schema"
  );
})();

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
 * This class schedules when to request news from the upstream repository.
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
    private readonly lifecycle: DraupnirNewsLifecycle,
    private readonly requestIntervalMS: number
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
    await this.lifecycle.checkForNews();
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
  private readonly newsReader = new DraupnirNewsReader(
    new DraupnirNewsLifecycle(
      new Set(this.settings.seenNews),
      FSNews,
      this.updateNews.bind(this),
      () => fetchNews(this.draupnir.config.draupnirNewsURL),
      (item) =>
        this.draupnir.clientPlatform
          .toRoomMessageSender()
          .sendMessage(
            this.draupnir.managementRoomID,
            item.matrix_event_content
          ) as Promise<Result<void>>
    ),
    4.32e7 // 12 hours
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
    this.newsReader.unregisterListeners();
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
