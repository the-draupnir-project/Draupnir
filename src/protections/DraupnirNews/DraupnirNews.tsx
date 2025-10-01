// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { sendMatrixEventsFromDeadDocument } from "@the-draupnir-project/mps-interface-adaptor";
import {
  AbstractProtection,
  ActionException,
  ActionExceptionKind,
  ConstantPeriodBatch,
  describeProtection,
  EDStatic,
  EventPermalinkSchema,
  isError,
  Logger,
  ProtectedRoomsSet,
  ProtectionDescription,
  RoomMessageSender,
  StandardTimedGate,
  StringEventIDSchema,
  Value,
} from "matrix-protection-suite";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../../Draupnir";
import { DraupnirProtection } from "../Protection";

const log = new Logger("DraupnirNews");

export const DraupnirNewsBlob = Type.Object({
  longhouse_cycle: Type.Object({
    summary: Type.String(),
    permalink: EventPermalinkSchema,
  }),
});

// FIXME: The protection setting for the old news isn't coming through.

export type DraupnirNewsBlob = EDStatic<typeof DraupnirNewsBlob>;

type UpdatePreviousNews = (eventID: StringEventID) => Promise<Result<void>>;

/**
 * This class manages request news about the longhouse assembly sessions.
 *
 * Lifecycle:
 * - unregisterListeners MUST be called when the parent protection is disposed.
 */
export class DraupnirLonghouseAssemblySessionNotification {
  public newsObject: DraupnirNewsBlob | undefined;
  private readonly newsGate = new StandardTimedGate(
    this.requestNews.bind(this),
    this.requestIntervalMS
  );
  private requestLoop: ConstantPeriodBatch;
  public constructor(
    private readonly newsURL: string,
    private readonly updatePreviousNews: UpdatePreviousNews,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly managementRoomID: StringRoomID,
    private readonly requestIntervalMS: number,
    private readonly previousNewsEventID: StringEventID | undefined
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
    const newsBlob = await fetch(this.newsURL, {
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
    if (isError(newsBlob)) {
      log.error("Unable to fetch news blob", newsBlob.error);
      return;
    }
    this.newsObject = newsBlob.ok;
    if (
      this.previousNewsEventID !==
      this.newsObject.longhouse_cycle.permalink.eventID
    ) {
      await this.notifyOfNews();
    }
  }

  private async notifyOfNews(): Promise<void> {
    if (this.newsObject === undefined) {
      return;
    }
    const updateResult = await this.updatePreviousNews(
      this.newsObject.longhouse_cycle.permalink.eventID
    );
    if (isError(updateResult)) {
      log.error("Unable to update stored news", updateResult.error);
      return;
    }
    const sendResult = await sendMatrixEventsFromDeadDocument(
      this.roomMessageSender,
      this.managementRoomID,
      <root>
        <h4>Draupnir longhouse assembly currently in session</h4>
        {this.newsObject.longhouse_cycle.summary}
        <br />
        Read about the work completed in the previous session, and discuss the
        direction of the project:{" "}
        {this.newsObject.longhouse_cycle.permalink.toPermalink()}.
      </root>,
      {}
    );
    if (isError(sendResult)) {
      log.error("Unable to send news to the management room");
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
    previousLonghouseCycleEventID: Type.Optional(StringEventIDSchema),
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
  private readonly longhouseCycleNews =
    new DraupnirLonghouseAssemblySessionNotification(
      this.draupnir.config.draupnirNewsURL,
      this.updateNews.bind(this),
      this.draupnir.clientPlatform.toRoomMessageSender(),
      this.draupnir.managementRoomID,
      4.32e7, // 12 hours
      this.settings.previousLonghouseCycleEventID
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

  private async updateNews(eventID: StringEventID): Promise<Result<void>> {
    const newSettings = this.description.protectionSettings
      .toMirror()
      .setValue(this.settings, "previousLonghouseCycleEventID", eventID);
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
