// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019, 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { LogLevel, LogService } from "matrix-bot-sdk";
import {
  AbstractProtection,
  ActionResult,
  EventConsequences,
  MembershipChange,
  MembershipChangeType,
  Ok,
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
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

export type FirstMessageIsImageProtectionCapabilities = {
  userConsequences: UserConsequences;
  eventConsequences: EventConsequences;
};

export type FirstMessageIsImageProtectionDescription = ProtectionDescription<
  Draupnir,
  UnknownConfig,
  FirstMessageIsImageProtectionCapabilities
>;

describeProtection<FirstMessageIsImageProtectionCapabilities, Draupnir>({
  name: "FirstMessageIsImageProtection",
  description:
    "If the first thing a user does after joining is to post an image or video, \
    they'll be banned for spam. This does not publish the ban to any of your ban lists.",
  capabilityInterfaces: {
    userConsequences: "UserConsequences",
    eventConsequences: "EventConsequences",
  },
  defaultCapabilities: {
    userConsequences: "StandardUserConsequences",
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
      new FirstMessageIsImageProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

export class FirstMessageIsImageProtection
  extends AbstractProtection<FirstMessageIsImageProtectionDescription>
  implements Protection<FirstMessageIsImageProtectionDescription>
{
  private justJoined: { [roomID: StringRoomID]: StringUserID[] } = {};
  private recentlyBanned: StringUserID[] = [];

  private readonly userConsequences: UserConsequences;
  private readonly eventConsequences: EventConsequences;
  constructor(
    description: FirstMessageIsImageProtectionDescription,
    capabilities: FirstMessageIsImageProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.userConsequences = capabilities.userConsequences;
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
      const msgtype = event.content["msgtype"];
      const formattedBody =
        "formatted_body" in event.content
          ? event.content["formatted_body"] || ""
          : "";
      const isMedia =
        msgtype === "m.image" ||
        msgtype === "m.video" ||
        formattedBody.toLowerCase().includes("<img");
      if (isMedia && this.justJoined[roomID].includes(event["sender"])) {
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "FirstMessageIsImage",
          `Banning ${event["sender"]} for posting an image as the first thing after joining in ${roomID}.`
        );
        if (!this.draupnir.config.noop) {
          await this.userConsequences.consequenceForUserInRoom(
            roomID,
            event["sender"],
            "spam"
          );
        } else {
          await this.draupnir.managementRoomOutput.logMessage(
            LogLevel.WARN,
            "FirstMessageIsImage",
            `Tried to ban ${event["sender"]} in ${roomID} but Draupnir is running in no-op mode`,
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
            "spam"
          );
        } else {
          await this.draupnir.managementRoomOutput.logMessage(
            LogLevel.WARN,
            "FirstMessageIsImage",
            `Tried to redact ${event["event_id"]} in ${roomID} but Draupnir is running in no-op mode`,
            roomID
          );
        }
      }
    }

    const idx = this.justJoined[roomID].indexOf(event["sender"]);
    if (idx >= 0) {
      LogService.info(
        "FirstMessageIsImage",
        `${event["sender"]} is no longer considered suspect`
      );
      this.justJoined[roomID].splice(idx, 1);
    }
    return Ok(undefined);
  }
}
