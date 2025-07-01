// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  EventWithMixins,
  isError,
  Logger,
  RoomMembershipRevisionIssuer,
  StandardTimedGate,
  UserFamiliarityStore,
} from "matrix-protection-suite";
import { UserRedactionStatusResponse } from "matrix-protection-suite-for-matrix-bot-sdk/dist/SynapseAdmin/UserRedactionEndpoint";

const log = new Logger("InteractionLogging");

/**
 * interactions don't count until a moderator has seen them.
 * interactions shouldn't count until time has elapsed since
 * the last interaction (not sure if the store is capable of doing this yet).
 * moderator messages in the management room need to be excluded.
 * the bot itself needs to be excluded.
 * The moderator revision needs to be a revision issuer and not just
 * a list that we pass as a dependency. The way that we can do this for now
 * is to just pass the management room membership revision issuer.
 */
export class StandardInteractionGate {
  private readonly gate = new StandardTimedGate(
    this.flushInteractions.bind(this),
    this.cooldownMS
  );
  private usersWhoSentPassableEventMixins = new Set<StringUserID>();
  private moderatorOnline = false;
  public constructor(
    private readonly userFamiliarityStore: UserFamiliarityStore,
    private readonly managementRoomMembership: RoomMembershipRevisionIssuer,
    private readonly botUserID: StringUserID,
    private readonly managementRoomID: StringRoomID,
    /** The amount of time to wait between flusing and persisting interactions */
    private readonly cooldownMS: number
  ) {
    // nothing to do.
  }

  /** Hold on a moment, we have no way of telling if a moderator is online yet. */
  private async flushInteractions(): Promise<void> {
    if (!this.moderatorOnline) {
      return;
    }
    const userIDs = [...this.usersWhoSentPassableEventMixins.keys()];
    this.usersWhoSentPassableEventMixins.clear();
    this.moderatorOnline = false;
    const storeResult =
      await this.userFamiliarityStore.observeInteractions(userIDs);
    if (isError(storeResult)) {
      log.error(
        "Failed to log interacions for several users",
        storeResult.error
      );
      return;
    }
  }

  public addInteraction(roomID: StringRoomID, userID: StringUserID): void {
    if (userID === this.botUserID || roomID === this.managementRoomID) {
      // don't log interactions from and with the bot.
      return;
    }
    if (
      this.managementRoomMembership.currentRevision.membershipForUser(userID)
    ) {
      this.moderatorOnline = true;
      UserRedactionStatusResponse;
    }
    this.usersWhoSentPassableEventMixins.add(userID);
    this.gate.enqueueOpen();
  }
}

export class StandardInteractionLogger {
  public constructor(private readonly gate: StandardInteractionGate) {
    // nothing to do.
  }

  handleTimelineEventMixins(
    roomID: StringRoomID,
    event: EventWithMixins
  ): void {
    // later we can tie in the permission system to stop infracted interactions
    // couning.
    this.gate.addInteraction(roomID, event.sourceEvent.sender);
  }
}
