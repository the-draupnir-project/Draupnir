
// Copyright 2024 The Matrix.org Foundation C.I.C.
// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Ok, Result } from '@gnuxie/typescript-result';
import { MatrixRoomID, StringEventID, StringUserID, StringRoomID } from '@the-draupnir-project/matrix-basic-types';
import { IConfig } from 'config';
import { AbstractProtection, ActionResult, EventConsequences, ProtectedRoomsSet, Protection, ProtectionDescription, RoomEvent, RoomMessage, UnknownSettings, Value } from 'matrix-protection-suite';
import * as nsfw from 'nsfwjs';
import { Draupnir } from '../Draupnir';
// FIXME: find a way to avoid depending on all of this just to decode the image!!!
import { node } from '@tensorflow/tfjs-node';

export type NSFWImageProtectionDescription = ProtectionDescription<
  unknown,
  UnknownSettings<string>,
  NSFWImageProtectionCapabilities
>;

function extractURLs(text: string): string[] {
  const urlRegex = /(mxc?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

export class NSFWImageProtection
  extends AbstractProtection<NSFWImageProtectionDescription>
  implements Protection<NSFWImageProtectionDescription>
{
  private readonly eventConsequences: EventConsequences;
  private model: null | nsfw.NSFWJS = null;
  constructor(
    description: NSFWImageProtectionDescription,
    capabilities: NSFWImageProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.eventConsequences = capabilities.eventConsequences;
  }

  private async getModel(): Promise<nsfw.NSFWJS> {
    if (this.model === null) {
      this.model = await nsfw.load();
    }
    return this.model;
  }

  public async handleTimelineEvent(room: MatrixRoomID, event: RoomEvent): Promise<Result<void>> {
    if (!Value.Check(RoomMessage, event)) {
      return Ok(undefined);
    }
    const msgtype = 'msgtype' in event.content ? event.content.msgtype : 'm.text';
    const formattedBody = 'formatted_body' in event.content ? event.content.formatted_body : '';
    const isMedia = msgtype === 'm.image' || formattedBody.toLowerCase().includes('<img');
    if (!isMedia) {
      return Ok(undefined);
    }
    // FIXME: we will probably want to extract both, and from the thumbnails too.
    const mxcs = "url" in event.content ? event.content.url : "body" in event.content ? extractURLs(event.content.body) : [];
    if (mxcs.length === 0) {
      return Ok(undefined)
    }

  }

  private async calculateProbability(mxc: string): Promise<number> {
    const image = await this.draupnir.client.downloadContent(mxc)
    const decodedImage = node.decodeImage(image.data, 3);
    const predictions = (await this.getModel()).classify(decodedImage)

    for (const prediction of predictions) {
        if (prediction["className"] === "Porn") {
            if (prediction["probability"] > mjolnir.config.nsfwSensitivity) {
                await mjolnir.managementRoomOutput.logMessage(LogLevel.INFO, "NSFWProtection", `Redacting ${event["event_id"]} for inappropriate content.`);
                try {
                    mjolnir.client.redactEvent(roomId, event["event_id"])
                } catch (err) {
                    await mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, "NSFWProtection", `There was an error redacting ${event["event_id"]}: ${err}`);

                }
            }
        } else if (prediction["className"] === "Hentai") {
            if (prediction["probability"] > mjolnir.config.nsfwSensitivity) {
                await mjolnir.managementRoomOutput.logMessage(LogLevel.INFO, "NSFWProtection", `Redacting ${event["event_id"]} for inappropriate content.`);
                try {
                    mjolnir.client.redactEvent(roomId, event["event_id"])
                } catch (err) {
                    await mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, "NSFWProtection", `There was an error redacting ${event["event_id"]}: ${err}`);
                }
            }
        }
    }
    decodedImage.dispose()
  }
}

export class NsfwProtection extends Protection {
    settings = {};
    private model: null | nsfw.NSFWJS;

    constructor() {
        super();
    }

    async initialize() {
        this.model = await nsfw.load();
    }

    public get name(): string {
        return 'NsfwProtection';
    }

    public get description(): string {
        return "Scans all images sent into a protected room to determine if the image is " +
            "NSFW. If it is, the image will automatically be redacted.";
    }

    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {

    }
}

export type NSFWImageProtectionCapabilities = {
  eventConsequences: EventConsequences;
};
