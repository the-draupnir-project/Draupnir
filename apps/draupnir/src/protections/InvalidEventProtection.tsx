// Copyright 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Type } from "@sinclair/typebox";
import {
  AbstractProtection,
  allocateProtection,
  describeProtection,
  EDStatic,
  EventConsequences,
  EventWithMixins,
  isError,
  Logger,
  OwnLifetime,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomMessageSender,
  Task,
  UserConsequences,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { LazyLeakyBucket } from "../queues/LeakyBucket";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import {
  renderMentionPill,
  sendMatrixEventsFromDeadDocument,
} from "@the-draupnir-project/mps-interface-adaptor";

const log = new Logger("InvalidEventProtection");

const InvalidEventProtectionSettings = Type.Object(
  {
    warningText: Type.String({
      description:
        "The reason to use to notify the user after redacting their infringing message.",
      default:
        "You have sent an invalid event that could cause problems in some Matrix clients, so we have had to redact it.",
    }),
  },
  {
    title: "InvalidEventProtectionSettings",
  }
);

type InvalidEventProtectionSettings = EDStatic<
  typeof InvalidEventProtectionSettings
>;

export type InvalidEventProtectionDescription = ProtectionDescription<
  unknown,
  typeof InvalidEventProtectionSettings,
  InvalidEventProtectionCapabilities
>;

export type InvalidEventProtectionCapabilities = {
  eventConsequences: EventConsequences;
  userConsequences: UserConsequences;
};

export class InvalidEventProtection
  extends AbstractProtection<InvalidEventProtectionDescription>
  implements Protection<InvalidEventProtectionDescription>
{
  private readonly eventConsequences: EventConsequences;
  private readonly userConsequences: UserConsequences;
  private readonly consequenceBucket = new LazyLeakyBucket<StringUserID>(
    1,
    30 * 60_000 // half an hour will do
  );
  public constructor(
    description: InvalidEventProtectionDescription,
    lifetime: OwnLifetime<InvalidEventProtectionDescription>,
    capabilities: InvalidEventProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly warningText: string,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly managentRoomID: StringRoomID
  ) {
    super(description, lifetime, capabilities, protectedRoomsSet, {});
    this.eventConsequences = capabilities.eventConsequences;
    this.userConsequences = capabilities.userConsequences;
  }

  private async redactEventWithMixin(event: EventWithMixins): Promise<void> {
    const redactResult = await this.eventConsequences.consequenceForEvent(
      event.sourceEvent.room_id,
      event.sourceEvent.event_id,
      "invalid event mixin"
    );
    if (isError(redactResult)) {
      log.error(
        `Failed to redact and event sent by ${event.sourceEvent.sender} in ${event.sourceEvent.room_id}`,
        redactResult.error
      );
    }
    const managementRoomSendResult = await sendMatrixEventsFromDeadDocument(
      this.roomMessageSender,
      this.managentRoomID,
      <root>
        <details>
          <summary>
            Copy of invalid event content from {event.sourceEvent.sender}
          </summary>
          <pre>{JSON.stringify(event.sourceEvent.content)}</pre>
        </details>
      </root>,
      {}
    );
    if (isError(managementRoomSendResult)) {
      log.error(
        "Failed to send redacted event details to the management room",
        managementRoomSendResult.error
      );
    }
  }

  private async sendWarning(event: EventWithMixins): Promise<void> {
    const result = await sendMatrixEventsFromDeadDocument(
      this.roomMessageSender,
      event.sourceEvent.room_id,
      <root>
        {renderMentionPill(event.sourceEvent.sender, event.sourceEvent.sender)}{" "}
        {this.warningText}
      </root>,
      { replyToEvent: event.sourceEvent }
    );
    if (isError(result)) {
      log.error(
        "Unable to warn the user",
        event.sourceEvent.sender,
        result.error
      );
    }
  }

  private async banUser(event: EventWithMixins): Promise<void> {
    const banResult = await this.userConsequences.consequenceForUserInRoom(
      event.sourceEvent.room_id,
      event.sourceEvent.sender,
      "Sending invalid events"
    );
    if (isError(banResult)) {
      log.error(
        "Unable to ban the sender of invalid events",
        event.sourceEvent.sender,
        event.sourceEvent.room_id,
        banResult.error
      );
    }
  }

  public handleProtectionDisable(): void {
    this.consequenceBucket.stop();
  }

  public handleTimelineEventMixins(
    _room: MatrixRoomID,
    event: EventWithMixins
  ): void {
    if (!event.mixins.some((mixin) => mixin.isErroneous)) {
      return;
    }
    const infractions = this.consequenceBucket.getTokenCount(
      event.sourceEvent.sender
    );
    if (infractions > 0) {
      void Task(this.banUser(event), { log });
    } else {
      void Task(this.sendWarning(event), { log });
    }
    this.consequenceBucket.addToken(event.sourceEvent.sender);
    void Task(this.redactEventWithMixin(event), { log });
  }
}

describeProtection<
  InvalidEventProtectionCapabilities,
  Draupnir,
  typeof InvalidEventProtectionSettings
>({
  name: "InvalidEventProtection",
  description: `Protect the room against malicious events or evasion of other protections.`,
  capabilityInterfaces: {
    eventConsequences: "EventConsequences",
    userConsequences: "UserConsequences",
  },
  defaultCapabilities: {
    eventConsequences: "StandardEventConsequences",
    userConsequences: "StandardUserConsequences",
  },
  configSchema: InvalidEventProtectionSettings,
  factory: async (
    decription,
    lifetime,
    protectedRoomsSet,
    draupnir,
    capabilitySet,
    settings
  ) =>
    allocateProtection(
      lifetime,
      new InvalidEventProtection(
        decription,
        lifetime,
        capabilitySet,
        protectedRoomsSet,
        settings.warningText,
        draupnir.clientPlatform.toRoomMessageSender(),
        draupnir.managementRoomID
      )
    ),
});
