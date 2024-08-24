// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AbstractProtection,
  ActionResult,
  EventConsequences,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomEvent,
  UnknownSettings,
  Value,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { IConfig } from "../config";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";

const MentionsContentSchema = Type.Object({
  "m.mentions": Type.Object({
    user_ids: Type.Array(Type.String()),
  }),
});

const NewContentMentionsSchema = Type.Object({
  "m.new_content": MentionsContentSchema,
});

export type MentionLimitProtectionDescription = ProtectionDescription<
  unknown,
  UnknownSettings<string>,
  MentionLimitProtectionCapabilities
>;

export class MentionLimitProtection
  extends AbstractProtection<MentionLimitProtectionDescription>
  implements Protection<MentionLimitProtectionDescription>
{
  private readonly eventConsequences: EventConsequences;
  private readonly redactReason: string;
  private readonly maxMentions: number;
  constructor(
    description: MentionLimitProtectionDescription,
    capabilities: MentionLimitProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    draupnirConfig: IConfig
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.eventConsequences = capabilities.eventConsequences;
    this.maxMentions =
      draupnirConfig.protections.mentionLimitProtection.maxMentions;
    this.redactReason =
      draupnirConfig.protections.mentionLimitProtection.redactReason;
  }
  public async handleTimelineEvent(
    _room: MatrixRoomID,
    event: RoomEvent
  ): Promise<ActionResult<void>> {
    const isOverLimit = (user_ids: string[]): boolean =>
      user_ids.length > this.maxMentions;
    if (
      Value.Check(NewContentMentionsSchema, event.content) &&
      isOverLimit(event.content["m.new_content"]["m.mentions"].user_ids)
    ) {
      return await this.eventConsequences.consequenceForEvent(
        event.room_id,
        event.event_id,
        this.redactReason
      );
    } else if (
      Value.Check(MentionsContentSchema, event.content) &&
      isOverLimit(event.content["m.mentions"].user_ids)
    ) {
      return await this.eventConsequences.consequenceForEvent(
        event.room_id,
        event.event_id,
        this.redactReason
      );
    } else {
      return Ok(undefined);
    }
  }
}

export type MentionLimitProtectionCapabilities = {
  eventConsequences: EventConsequences;
};

describeProtection<MentionLimitProtectionCapabilities, Draupnir>({
  name: "MentionLimitProtection",
  description: `Highly experimental protection that will remove any messages with
    a number of mentions over a preconfigured limit.
    Please read the documentation https://the-draupnir-project.github.io/draupnir-documentation/protections/mention-limit-protection.`,
  capabilityInterfaces: {
    eventConsequences: "EventConsequences",
  },
  defaultCapabilities: {
    eventConsequences: "StandardEventConsequences",
  },
  factory: (decription, protectedRoomsSet, draupnir, capabilitySet) =>
    Ok(
      new MentionLimitProtection(
        decription,
        capabilitySet,
        protectedRoomsSet,
        draupnir.config
      )
    ),
});
