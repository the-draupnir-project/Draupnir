// Copyright 2026 Emma [it/its] @ Rory& <root@rory.gay>
//
// SPDX-License-Identifier: Apache-2.0

import { LogLevel, LogService } from "@vector-im/matrix-bot-sdk";
import {
  AbstractProtection,
  ActionResult,
  EventConsequences,
  MembershipChange,
  MembershipChangeType,
  Ok,
  OwnLifetime,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomEvent,
  RoomMembershipRevision,
  RoomMessage,
  UnknownConfig,
  UserConsequences,
  Value,
  describeProtection,
} from "@the-draupnir-project/matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

export type FirstMessageIsWordProtectionCapabilities = {
  userConsequences: UserConsequences;
  eventConsequences: EventConsequences;
};

export type FirstMessageIsWordProtectionDescription = ProtectionDescription<
  Draupnir,
  UnknownConfig,
  FirstMessageIsWordProtectionCapabilities
>;

describeProtection<FirstMessageIsWordProtectionCapabilities, Draupnir>({
  name: "FirstMessageIsWordProtection",
  description:
    "If the first thing a user does after joining is to post a configured word, this protection kicks the user from the room.",
  capabilityInterfaces: {
    userConsequences: "UserConsequences",
    eventConsequences: "EventConsequences",
  },
  defaultCapabilities: {
    userConsequences: "StandardUserConsequences",
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
      new FirstMessageIsWordProtection(
        description,
        lifetime,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

export class FirstMessageIsWordProtection
  extends AbstractProtection<FirstMessageIsWordProtectionDescription>
  implements Protection<FirstMessageIsWordProtectionDescription>
{
  private justJoined: { [roomID: StringRoomID]: StringUserID[] } = {};
  private recentlyBanned: StringUserID[] = [];

  private readonly eventConsequences: EventConsequences;
  constructor(
    description: FirstMessageIsWordProtectionDescription,
    lifetime: OwnLifetime<FirstMessageIsWordProtectionDescription>,
    capabilities: FirstMessageIsWordProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, lifetime, capabilities, protectedRoomsSet, {});
    this.eventConsequences = capabilities.eventConsequences;
  }

  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    const roomID = revision.room.toRoomIDOrAlias();
    if (!this.justJoined[roomID]) this.justJoined[roomID] = [];
    for (const change of changes) {
      if (change.membershipChangeType === MembershipChangeType.Joined) {
        this.justJoined[roomID].push(change.userID);
      }
    }
    return Ok(undefined);
  }

  public async handleTimelineEvent(
    room: MatrixRoomID,
    event: RoomEvent
  ): Promise<ActionResult<void>> {
    const roomID = room.toRoomIDOrAlias();
    if (!this.justJoined[roomID]) this.justJoined[roomID] = [];
    if (Value.Check(RoomMessage, event)) {
      if (!("msgtype" in event.content)) {
        return Ok(undefined);
      }
      const includesBlockedWord =
        this.draupnir.config.protections.firstMessageIsWordProtection.words.some(
          (word) =>
            ("body" in event.content &&
              typeof event.content.body === "string" &&
              event.content.body.toLowerCase().includes(word.toLowerCase())) ||
            ("formatted_body" in event.content &&
              typeof event.content.formatted_body === "string" &&
              event.content.formatted_body
                .toLowerCase()
                .includes(word.toLowerCase()))
        );

      if (
        includesBlockedWord &&
        this.justJoined[roomID].includes(event["sender"])
      ) {
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "FirstMessageIsWord",
          `Banning ${event["sender"]} for posting an disallowed word as the first thing after joining in ${roomID}.`
        );

        if (!this.draupnir.config.noop) {
          await this.draupnir.client.kickUser(
            event.sender,
            event.room_id,
            "You have been kicked for posting a disallowed word in your first message. Please read the room topic and keep discussion on-topic!"
          );
        } else {
          await this.draupnir.managementRoomOutput.logMessage(
            LogLevel.WARN,
            "FirstMessageIsWord",
            `Tried to kick ${event["sender"]} in ${roomID} but Draupnir is running in no-op mode`,
            roomID
          );
        }

        if (this.recentlyBanned.includes(event["sender"])) {
          return Ok(undefined); // already handled (will be redacted)
        }

        this.draupnir.unlistedUserRedactionQueue.addUser(event["sender"]);
        this.recentlyBanned.push(event["sender"]); // flag to reduce spam

        // Redact the event
        if (!this.draupnir.config.noop) {
          await this.eventConsequences.consequenceForEvent(
            roomID,
            event["event_id"],
            "Disallowed word"
          );
        } else {
          await this.draupnir.managementRoomOutput.logMessage(
            LogLevel.WARN,
            "FirstMessageIsWord",
            `Tried to redact ${event["event_id"]} in ${roomID} but Draupnir is running in no-op mode`,
            roomID
          );
        }
      }
    }

    const idx = this.justJoined[roomID].indexOf(event["sender"]);
    if (idx >= 0) {
      LogService.info(
        "FirstMessageIsWordProtection",
        `${event["sender"]} is no longer considered suspect`
      );
      this.justJoined[roomID].splice(idx, 1);
    }
    return Ok(undefined);
  }
}
