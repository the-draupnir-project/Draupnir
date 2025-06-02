// Copyright 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2024 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractProtection,
  ActionResult,
  EDStatic,
  EventConsequences,
  Logger,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomEvent,
  RoomMessageSender,
  Task,
  UserConsequences,
  Value,
  describeProtection,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";
import { LazyLeakyBucket } from "../queues/LeakyBucket";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import {
  renderMentionPill,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";

const log = new Logger("MentionLimitProtection");

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
  maxMentions: number,
  checkBody: boolean
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
  if (checkBody && Value.Check(WeakTextContentSchema, event.content)) {
    if (
      event.content.body !== undefined &&
      event.content.body.split("@").length - 1 > maxMentions
    ) {
      return true;
    }
  }
  return false;
}

const MentionLimitProtectionSettings = Type.Object(
  {
    maxMentions: Type.Integer({
      description: "The maximum number of mentions permitted.",
      default: 3,
    }),
    warningText: Type.String({
      description:
        "The reason to use to notify the user after redacting their infringing message.",
      default:
        "You have mentioned too many users in this message, so we have had to redact it.",
    }),
    includeLegacyMentions: Type.Boolean({
      description:
        "Whether to scrape the body for legacy mentions, can lead to more false positives.",
      default: false,
    }),
  },
  {
    title: "MentionLimitProtectionSettings",
  }
);

type MentionLimitProtectionSettings = EDStatic<
  typeof MentionLimitProtectionSettings
>;

export type MentionLimitProtectionDescription = ProtectionDescription<
  unknown,
  typeof MentionLimitProtectionSettings,
  MentionLimitProtectionCapabilities
>;

export class MentionLimitProtection
  extends AbstractProtection<MentionLimitProtectionDescription>
  implements Protection<MentionLimitProtectionDescription>
{
  private readonly eventConsequences: EventConsequences;
  private readonly userConsequences: UserConsequences;
  private readonly warningText: string;
  private readonly maxMentions: number;
  private readonly includeLegacymentions: boolean;
  private readonly consequenceBucket = new LazyLeakyBucket<StringUserID>(
    1,
    30 * 60_000 // half an hour will do
  );
  constructor(
    description: MentionLimitProtectionDescription,
    capabilities: MentionLimitProtectionCapabilities,
    private readonly roomMessageSender: RoomMessageSender,
    protectedRoomsSet: ProtectedRoomsSet,
    settings: MentionLimitProtectionSettings
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.eventConsequences = capabilities.eventConsequences;
    this.userConsequences = capabilities.userConsequences;
    this.maxMentions = settings.maxMentions;
    this.warningText = settings.warningText;
    this.includeLegacymentions = settings.includeLegacyMentions;
  }
  public async handleTimelineEvent(
    _room: MatrixRoomID,
    event: RoomEvent
  ): Promise<ActionResult<void>> {
    if (event.sender === this.protectedRoomsSet.userID) {
      return Ok(undefined);
    }
    if (
      isContainingMentionsOverLimit(
        event,
        this.maxMentions,
        this.includeLegacymentions
      )
    ) {
      const infractions = this.consequenceBucket.getTokenCount(event.sender);
      if (infractions > 0) {
        const userResult = await this.userConsequences.consequenceForUserInRoom(
          event.room_id,
          event.sender,
          this.warningText
        );
        if (isError(userResult)) {
          log.error("Failed to ban the user", event.sender, userResult.error);
        }
        // fall through to the event consequence on purpose so we redact the event too.
      } else {
        // if they're not being banned we need to tell them why their message got redacted.
        void Task(
          sendMatrixEventsFromDeadDocument(
            this.roomMessageSender,
            event.room_id,
            <root>
              {renderMentionPill(event.sender, event.sender)} {this.warningText}
            </root>,
            { replyToEvent: event }
          ),
          {
            log,
          }
        );
      }
      this.consequenceBucket.addToken(event.sender);
      return await this.eventConsequences.consequenceForEvent(
        event.room_id,
        event.event_id,
        this.warningText
      );
    } else {
      return Ok(undefined);
    }
  }
}

export type MentionLimitProtectionCapabilities = {
  eventConsequences: EventConsequences;
  userConsequences: UserConsequences;
};

describeProtection<
  MentionLimitProtectionCapabilities,
  Draupnir,
  typeof MentionLimitProtectionSettings
>({
  name: "MentionLimitProtection",
  description: `A potection that will remove any messages with
    a number of mentions over a preconfigured limit.
    Please read the documentation https://the-draupnir-project.github.io/draupnir-documentation/protections/mention-limit-protection.`,
  capabilityInterfaces: {
    eventConsequences: "EventConsequences",
    userConsequences: "UserConsequences",
  },
  defaultCapabilities: {
    eventConsequences: "StandardEventConsequences",
    userConsequences: "StandardUserConsequences",
  },
  configSchema: MentionLimitProtectionSettings,
  factory: async (
    decription,
    protectedRoomsSet,
    draupnir,
    capabilitySet,
    settings
  ) =>
    Ok(
      new MentionLimitProtection(
        decription,
        capabilitySet,
        draupnir.clientPlatform.toRoomMessageSender(),
        protectedRoomsSet,
        settings
      )
    ),
});
