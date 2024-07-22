/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { LogLevel, LogService } from "matrix-bot-sdk";
import {
  AbstractProtection,
  ActionResult,
  EventConsequences,
  MatrixRoomID,
  MembershipChange,
  MembershipChangeType,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomEvent,
  RoomMembershipRevision,
  RoomMessage,
  StringRoomID,
  StringUserID,
  UserConsequences,
  Value,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";

type FirstMessageIsImageProtectionSettings = Record<never, never>;

export type FirstMessageIsImageProtectionCapabilities = {
  userConsequences: UserConsequences;
  eventConsequences: EventConsequences;
};

export type FirstMessageIsImageProtectionDescription = ProtectionDescription<
  Draupnir,
  FirstMessageIsImageProtectionSettings,
  FirstMessageIsImageProtectionCapabilities
>;

describeProtection<
  FirstMessageIsImageProtectionCapabilities,
  Draupnir,
  FirstMessageIsImageProtectionSettings
>({
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
  private justJoined: { [roomID: StringRoomID]: StringUserID[] | undefined } =
    {};
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
            `Tried to ban ${event["sender"]} in ${roomID} but Mjolnir is running in no-op mode`,
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
            `Tried to redact ${event["event_id"]} in ${roomID} but Mjolnir is running in no-op mode`,
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
