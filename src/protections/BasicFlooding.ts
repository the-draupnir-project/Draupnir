// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019, 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  StringEventID,
  StringUserID,
  StringRoomID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { Draupnir } from "../Draupnir";
import { DraupnirProtection } from "./Protection";
import { LogLevel } from "matrix-bot-sdk";
import {
  AbstractProtection,
  ActionResult,
  EDStatic,
  EventConsequences,
  Logger,
  Ok,
  ProtectedRoomsSet,
  ProtectionDescription,
  RoomEvent,
  UserConsequences,
  describeProtection,
  isError,
} from "matrix-protection-suite";
import { Type } from "@sinclair/typebox";

const log = new Logger("BasicFloodingProtection");

// if this is exceeded, we'll ban the user for spam and redact their messages
export const DEFAULT_MAX_PER_MINUTE = 10;
const TIMESTAMP_THRESHOLD = 30000; // 30s out of phase

const BasicFloodingProtectionSettings = Type.Object(
  {
    maxPerMinute: Type.Integer({ default: DEFAULT_MAX_PER_MINUTE }),
  },
  { title: "BasicFloodingProtectionSettings" }
);
type BasicFloodingProtectionSettings = EDStatic<
  typeof BasicFloodingProtectionSettings
>;

export type BasicFloodingProtectionCapabilities = {
  userConsequences: UserConsequences;
  eventConsequences: EventConsequences;
};

export type BasicFloodingProtectionDescription = ProtectionDescription<
  Draupnir,
  typeof BasicFloodingProtectionSettings,
  BasicFloodingProtectionCapabilities
>;

describeProtection<
  BasicFloodingProtectionCapabilities,
  Draupnir,
  typeof BasicFloodingProtectionSettings
>({
  name: "BasicFloodingProtection",
  description: `If a user posts more than ${DEFAULT_MAX_PER_MINUTE} messages in 60s they'll be
    banned for spam. This does not publish the ban to any of your ban lists.
    This is a legacy protection from Mjolnir and contains bugs.`,
  capabilityInterfaces: {
    userConsequences: "UserConsequences",
    eventConsequences: "EventConsequences",
  },
  defaultCapabilities: {
    userConsequences: "StandardUserConsequences",
    eventConsequences: "StandardEventConsequences",
  },
  configSchema: BasicFloodingProtectionSettings,
  factory: async (
    description,
    protectedRoomsSet,
    draupnir,
    capabilities,
    rawSettings
  ) => {
    const parsedSettings =
      description.protectionSettings.parseConfig(rawSettings);
    if (isError(parsedSettings)) {
      return parsedSettings;
    }
    return Ok(
      new BasicFloodingProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir,
        parsedSettings.ok.maxPerMinute
      )
    );
  },
});

type LastEvents = { originServerTs: number; eventID: StringEventID }[];
type LastEventsByUser = Map<StringUserID, LastEvents>;
type LastEventsByRoom = Map<StringRoomID, LastEventsByUser>;

function lastEventsRoomEntry(
  lastEvents: LastEventsByRoom,
  roomID: StringRoomID
): LastEventsByUser {
  const roomEntry = lastEvents.get(roomID);
  if (roomEntry) {
    return roomEntry;
  } else {
    const nextEntry = new Map();
    lastEvents.set(roomID, nextEntry);
    return nextEntry;
  }
}

function lastEventsUserEntry(
  eventsByUser: LastEventsByUser,
  userID: StringUserID
): LastEvents {
  const userEntry = eventsByUser.get(userID);
  if (userEntry === undefined) {
    const events: LastEvents = [];
    eventsByUser.set(userID, events);
    return events;
  }
  return userEntry;
}

function lastEventsForUser(
  lastEventsByRoom: LastEventsByRoom,
  roomID: StringRoomID,
  userID: StringUserID
): LastEvents {
  const roomEntry = lastEventsRoomEntry(lastEventsByRoom, roomID);
  const userEvents = lastEventsUserEntry(roomEntry, userID);
  return userEvents;
}

export class BasicFloodingProtection
  extends AbstractProtection<BasicFloodingProtectionDescription>
  implements DraupnirProtection<BasicFloodingProtectionDescription>
{
  private lastEvents: LastEventsByRoom = new Map();
  private recentlyBanned: string[] = [];

  private readonly userConsequences: UserConsequences;
  private readonly eventConsequences: EventConsequences;
  public constructor(
    description: BasicFloodingProtectionDescription,
    capabilities: BasicFloodingProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir,
    private readonly maxPerMinute: number
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.userConsequences = capabilities.userConsequences;
    this.eventConsequences = capabilities.eventConsequences;
  }

  public async handleTimelineEvent(
    room: MatrixRoomID,
    event: RoomEvent
  ): Promise<ActionResult<void>> {
    // If the sender is draupnir, ignore the message
    if (event["sender"] === this.draupnir.clientUserID) {
      log.debug(`Ignoring message from self: ${event.event_id}`);
      return Ok(undefined);
    }
    // If the event is a redaction, ignore it.
    // See also: https://github.com/the-draupnir-project/Draupnir/issues/804
    if (event["type"] === "m.room.redaction") {
      log.debug(`Ignoring redaction: ${event.event_id}`);
      return Ok(undefined);
    }
    const forUser = lastEventsForUser(
      this.lastEvents,
      event.room_id,
      event.sender
    );

    if (
      new Date().getTime() - event["origin_server_ts"] >
      TIMESTAMP_THRESHOLD
    ) {
      log.warn(
        "BasicFlooding",
        `${event["event_id"]} is more than ${TIMESTAMP_THRESHOLD}ms out of phase - rewriting event time to be 'now'`
      );
      event["origin_server_ts"] = new Date().getTime();
    }

    forUser.push({
      originServerTs: event["origin_server_ts"],
      eventID: event["event_id"],
    });

    // Do some math to see if the user is spamming
    let messageCount = 0;
    for (const prevEvent of forUser) {
      if (new Date().getTime() - prevEvent.originServerTs > 60000) continue; // not important
      messageCount++;
    }

    if (messageCount >= this.maxPerMinute) {
      await this.draupnir.managementRoomOutput.logMessage(
        LogLevel.WARN,
        "BasicFlooding",
        `Banning ${event["sender"]} in ${room.toRoomIDOrAlias()} for flooding (${messageCount} messages in the last minute)`,
        room.toRoomIDOrAlias()
      );
      if (!this.draupnir.config.noop) {
        await this.userConsequences.consequenceForUserInRoom(
          room.toRoomIDOrAlias(),
          event["sender"],
          "spam"
        );
      } else {
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "BasicFlooding",
          `Tried to ban ${event["sender"]} in ${room.toRoomIDOrAlias()} but Draupnir is running in no-op mode`,
          room.toRoomIDOrAlias()
        );
      }

      if (this.recentlyBanned.includes(event["sender"])) {
        return Ok(undefined);
      } // already handled (will be redacted)
      this.draupnir.unlistedUserRedactionQueue.addUser(event["sender"]);
      this.recentlyBanned.push(event["sender"]); // flag to reduce spam

      // Redact all the things the user said too
      if (!this.draupnir.config.noop) {
        for (const eventID of forUser.map((e) => e.eventID)) {
          await this.eventConsequences.consequenceForEvent(
            room.toRoomIDOrAlias(),
            eventID,
            "spam"
          );
        }
      } else {
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "BasicFlooding",
          `Tried to redact messages for ${event["sender"]} in ${room.toRoomIDOrAlias()} but Draupnir is running in no-op mode`,
          room.toRoomIDOrAlias()
        );
      }

      // Free up some memory now that we're ready to handle it elsewhere
      forUser.splice(0, forUser.length);
    }

    // Trim the oldest messages off the user's history if it's getting large
    if (forUser.length > this.maxPerMinute * 2) {
      forUser.splice(0, forUser.length - this.maxPerMinute * 2 - 1);
    }
    return Ok(undefined);
  }
}
