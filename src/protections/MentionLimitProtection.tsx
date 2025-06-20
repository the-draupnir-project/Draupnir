// Copyright 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2024 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractProtection,
  ContentMixins,
  EDStatic,
  EventConsequences,
  EventWithMixins,
  Logger,
  MentionsMixin,
  MentionsMixinDescription,
  NewContentMixinDescription,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomMessageBodyMixinDescription,
  RoomMessageSender,
  Task,
  UserConsequences,
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
import { Result } from "@gnuxie/typescript-result";

const log = new Logger("MentionLimitProtection");

function isMentionsMixinOverLimit(
  mentionsMixin: MentionsMixin,
  maxMentions: number
): boolean {
  return mentionsMixin.user_ids.length > maxMentions;
}

function isContentContaningMentionsOverLimit(
  content: ContentMixins,
  maxMentions: number,
  checkBody: boolean
): boolean {
  const mentionMixin = content.findMixin(MentionsMixinDescription);
  if (
    mentionMixin?.isErroneous === false &&
    isMentionsMixinOverLimit(mentionMixin, maxMentions)
  ) {
    return true;
  }
  if (!checkBody) {
    return false;
  }
  const bodyMixin = content.findMixin(RoomMessageBodyMixinDescription);
  if (bodyMixin === undefined || bodyMixin.isErroneous) {
    return false;
  }
  return bodyMixin.body.split("@").length - 1 > maxMentions;
}

export function isContainingMentionsOverLimit(
  event: EventWithMixins,
  maxMentions: number,
  checkBody: boolean
): boolean {
  const isTopContentOverLimit = isContentContaningMentionsOverLimit(
    event,
    maxMentions,
    checkBody
  );
  if (isTopContentOverLimit) {
    return true;
  }
  const newContentMixin = event.findMixin(NewContentMixinDescription);
  if (newContentMixin === undefined || newContentMixin.isErroneous) {
    return false;
  }
  return isContentContaningMentionsOverLimit(
    newContentMixin,
    maxMentions,
    checkBody
  );
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
  public handleTimelineEventMixins(
    _room: MatrixRoomID,
    event: EventWithMixins
  ): void {
    if (event.sourceEvent.sender === this.protectedRoomsSet.userID) {
      return;
    }
    if (
      isContainingMentionsOverLimit(
        event,
        this.maxMentions,
        this.includeLegacymentions
      )
    ) {
      void Task(this.handleEventOverLimit(event), {
        log,
      });
    }
  }

  public async handleEventOverLimit(
    event: EventWithMixins
  ): Promise<Result<void>> {
    const sourceEvent = event.sourceEvent;
    const infractions = this.consequenceBucket.getTokenCount(
      sourceEvent.sender
    );
    if (infractions > 0) {
      const userResult = await this.userConsequences.consequenceForUserInRoom(
        sourceEvent.room_id,
        sourceEvent.sender,
        this.warningText
      );
      if (isError(userResult)) {
        log.error(
          "Failed to ban the user",
          sourceEvent.sender,
          userResult.error
        );
      }
      // fall through to the event consequence on purpose so we redact the event too.
    } else {
      // if they're not being banned we need to tell them why their message got redacted.
      void Task(
        sendMatrixEventsFromDeadDocument(
          this.roomMessageSender,
          sourceEvent.room_id,
          <root>
            {renderMentionPill(sourceEvent.sender, sourceEvent.sender)}{" "}
            {this.warningText}
          </root>,
          { replyToEvent: sourceEvent }
        ),
        {
          log,
        }
      );
    }
    this.consequenceBucket.addToken(sourceEvent.sender);
    return await this.eventConsequences.consequenceForEvent(
      sourceEvent.room_id,
      sourceEvent.event_id,
      this.warningText
    );
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
