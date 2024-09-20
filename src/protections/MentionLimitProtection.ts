// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2024 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0

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

const WeakTextContentSchema = Type.Object({
  body: Type.Optional(Type.String()),
  formatted_body: Type.Optional(Type.String()),
});

export function isContainingMentionsOverLimit(
  event: RoomEvent,
  maxMentions: number
): boolean {
  const isOverLimit = (user_ids: string[]): boolean =>
    user_ids.length > maxMentions;
  if (
    Value.Check(NewContentMentionsSchema, event.content) &&
    isOverLimit(event.content["m.new_content"]["m.mentions"].user_ids)
  ) {
    return true;
  }
  if (
    Value.Check(MentionsContentSchema, event.content) &&
    isOverLimit(event.content["m.mentions"].user_ids)
  ) {
    return true;
  }
  if (Value.Check(WeakTextContentSchema, event.content)) {
    if (
      event.content.body !== undefined &&
      event.content.body.split("@").length - 1 > maxMentions
    ) {
      return true;
    }
  }
  return false;
}

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
    if (isContainingMentionsOverLimit(event, this.maxMentions)) {
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
  description: `A potection that will remove any messages with
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
