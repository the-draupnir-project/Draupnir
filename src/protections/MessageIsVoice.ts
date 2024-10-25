// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 The Matrix.org Foundation C.I.C.
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

type MessageIsVoiceCapabilities = {
  eventConsequences: EventConsequences;
};

type MessageIsVoiceSettings = UnknownConfig;

type MessageIsVoiceDescription = ProtectionDescription<
  Draupnir,
  MessageIsVoiceSettings,
  MessageIsVoiceCapabilities
>;

describeProtection<MessageIsVoiceCapabilities, Draupnir>({
  name: "MessageIsVoiceProtection",
  description: "If a user posts a voice message, that message will be redacted",
  capabilityInterfaces: {
    eventConsequences: "EventConsequences",
  },
  defaultCapabilities: {
    eventConsequences: "StandardEventConsequences",
  },
  factory: function (
    description,
    protectedRoomsSet,
    draupnir,
    capabilities,
    _settings
  ) {
    return Ok(
      new MessageIsVoiceProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

export class MessageIsVoiceProtection
  extends AbstractProtection<MessageIsVoiceDescription>
  implements Protection<MessageIsVoiceDescription>
{
  private readonly eventConsequences: EventConsequences;
  constructor(
    description: MessageIsVoiceDescription,
    capabilities: MessageIsVoiceCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.eventConsequences = capabilities.eventConsequences;
  }

  public async handleTimelineEvent(
    room: MatrixRoomID,
    event: RoomEvent
  ): Promise<ActionResult<void>> {
    const roomID = room.toRoomIDOrAlias();
    if (Value.Check(RoomMessage, event)) {
      if (
        !("msgtype" in event.content) ||
        event.content.msgtype !== "m.audio"
      ) {
        return Ok(undefined);
      }
      await this.draupnir.managementRoomOutput.logMessage(
        LogLevel.INFO,
        "MessageIsVoice",
        `Redacting event from ${event["sender"]} for posting a voice message. ${Permalinks.forEvent(roomID, event["event_id"], [userServerName(this.draupnir.clientUserID)])}`
      );
      // Redact the event
      if (!this.draupnir.config.noop) {
        return await this.eventConsequences.consequenceForEvent(
          roomID,
          event["event_id"],
          "Voice messages are not permitted here"
        );
      } else {
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "MessageIsVoice",
          `Tried to redact ${event["event_id"]} in ${roomID} but Draupnir is running in no-op mode`,
          roomID
        );
        return Ok(undefined);
      }
    }
    return Ok(undefined);
  }
}
