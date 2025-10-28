// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { LogLevel } from "matrix-bot-sdk";
import {
  AbstractProtection,
  ActionResult,
  EventConsequences,
  Ok,
  OwnLifetime,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomEvent,
  RoomMessage,
  UnknownConfig,
  Value,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomID,
  Permalinks,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";

type MessageIsMediaProtectionSettings = UnknownConfig;

type MessageIsMediaCapabilities = {
  eventConsequences: EventConsequences;
};

type MessageIsMediaProtectionDescription = ProtectionDescription<
  Draupnir,
  MessageIsMediaProtectionSettings,
  MessageIsMediaCapabilities
>;

describeProtection<MessageIsMediaCapabilities, Draupnir>({
  name: "MessageIsMediaProtection",
  description:
    "If a user posts an image or video, that message will be redacted. No bans are issued.",
  capabilityInterfaces: {
    eventConsequences: "EventConsequences",
  },
  defaultCapabilities: {
    eventConsequences: "StandardEventConsequences",
  },
  factory: async function (
    description,
    lifetime,
    protectedRoomsSet,
    draupnir,
    capabilities,
    _settings
  ) {
    return Ok(
      new MessageIsMediaProtection(
        description,
        lifetime,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

export class MessageIsMediaProtection
  extends AbstractProtection<MessageIsMediaProtectionDescription>
  implements Protection<MessageIsMediaProtectionDescription>
{
  private readonly eventConsequences: EventConsequences;
  constructor(
    description: MessageIsMediaProtectionDescription,
    lifetime: OwnLifetime<Protection<MessageIsMediaProtectionDescription>>,
    capabilities: MessageIsMediaCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, lifetime, capabilities, protectedRoomsSet, {});
    this.eventConsequences = capabilities.eventConsequences;
  }

  public async handleTimelineEvent(
    room: MatrixRoomID,
    event: RoomEvent
  ): Promise<ActionResult<void>> {
    if (Value.Check(RoomMessage, event)) {
      if (!("msgtype" in event.content)) {
        return Ok(undefined);
      }
      const msgtype = event.content["msgtype"];
      const formattedBody =
        "formatted_body" in event.content
          ? event.content["formatted_body"] || ""
          : "";
      const isMedia =
        msgtype === "m.image" ||
        msgtype === "m.video" ||
        formattedBody.toLowerCase().includes("<img");
      if (isMedia) {
        const roomID = room.toRoomIDOrAlias();
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "MessageIsMedia",
          `Redacting event from ${event["sender"]} for posting an image/video. ${Permalinks.forEvent(roomID, event["event_id"], [userServerName(this.draupnir.clientUserID)])}`
        );
        // Redact the event
        if (!this.draupnir.config.noop) {
          await this.eventConsequences.consequenceForEvent(
            roomID,
            event["event_id"],
            "Images/videos are not permitted here"
          );
        } else {
          await this.draupnir.managementRoomOutput.logMessage(
            LogLevel.WARN,
            "MessageIsMedia",
            `Tried to redact ${event["event_id"]} in ${roomID} but Draupnir is running in no-op mode`,
            roomID
          );
        }
      }
    }
    return Ok(undefined);
  }
}
