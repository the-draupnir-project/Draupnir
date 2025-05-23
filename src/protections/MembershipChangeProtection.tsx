// Copyright 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractProtection,
  EDStatic,
  Logger,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomEvent,
  RoomMessageSender,
  SafeMembershipEvent,
  SafeMembershipEventMirror,
  UserConsequences,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";
import { LazyLeakyBucket, LeakyBucket } from "../queues/LeakyBucket";
import { isError, Result } from "@gnuxie/typescript-result";
import { sendMatrixEventsFromDeadDocument } from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { renderMentionPill } from "../commands/interface-manager/MatrixHelpRenderer";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";

const DEFAULT_MAX_PER_TIMESCALE = 7;
const DEFAULT_TIMESCALE_MINUTES = 60;
const ONE_MINUTE = 60_000; // 1min in ms

const log = new Logger("MembershipChangeProtection");

const MembershipChangeProtectionSettings = Type.Object(
  {
    maxChangesPerUser: Type.Integer({
      default: DEFAULT_MAX_PER_TIMESCALE,
      description:
        "The maximum number of membership changes that a single user can perform within the timescaleMinutes before the consequence is enacted.",
    }),
    timescaleMinutes: Type.Integer({
      default: DEFAULT_TIMESCALE_MINUTES,
      description:
        "The timescale in minutes over which the maxChangesPerUser is relevant before the consequence is enacted.",
    }),
    finalConsequenceReason: Type.String({
      default:
        "You are changing your membership too frequently and have been removed as a precaution.",
      description: "The reason given to the user when they are rate limited.",
    }),
    warningText: Type.String({
      default:
        "Hi, you are changing your room membership too frequently, and may be temporarily banned as an automated precaution if you continue.",
      description:
        "The message to send to the user when they are nearing the rate limit.",
    }),
  },
  { title: "MembershipChangeProtectionSettings" }
);

type MembershipChangeProtectionSettings = EDStatic<
  typeof MembershipChangeProtectionSettings
>;

function makeBucketKey(roomID: StringRoomID, userID: StringUserID): string {
  return roomID + userID;
}

export type MembershipChangeProtectionDescription = ProtectionDescription<
  unknown,
  typeof MembershipChangeProtectionSettings,
  MembershipChangeProtectionCapabilities
>;

export class MembershipChangeProtection
  extends AbstractProtection<MembershipChangeProtectionDescription>
  implements Protection<MembershipChangeProtectionDescription>
{
  private readonly finalConsequences: UserConsequences;
  public readonly changeBucket: LeakyBucket<string>;
  // just a crap attempt to stop consequences being spammed
  private readonly consequenceBucket = new LazyLeakyBucket(
    1,
    this.timescaleMilliseconds()
  );
  private readonly warningThreshold = Math.floor(
    this.settings.maxChangesPerUser * 0.6
  );
  constructor(
    description: MembershipChangeProtectionDescription,
    capabilities: MembershipChangeProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly messageSender: RoomMessageSender,
    public readonly settings: MembershipChangeProtectionSettings
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.finalConsequences = capabilities.finalConsequences;
    this.changeBucket = new LazyLeakyBucket(
      this.settings.maxChangesPerUser,
      this.timescaleMilliseconds()
    );
  }

  public async handleTimelineEvent(
    room: MatrixRoomID,
    event: RoomEvent
  ): Promise<Result<void>> {
    if (!SafeMembershipEventMirror.isSafeContent(event.content)) {
      return Ok(undefined);
    }
    const safeEvent = event as SafeMembershipEvent;
    if (safeEvent.sender !== safeEvent.state_key) {
      return Ok(undefined); // they're being banned or kicked.
    }
    const key = makeBucketKey(event.room_id, safeEvent.state_key);
    const numberOfChanges = this.changeBucket.addToken(key);
    if (
      numberOfChanges >= this.warningThreshold &&
      this.consequenceBucket.getTokenCount(key) === 0
    ) {
      this.consequenceBucket.addToken(key);
      const warningResult = await sendMatrixEventsFromDeadDocument(
        this.messageSender,
        safeEvent.room_id,
        <root>
          {renderMentionPill(
            safeEvent.state_key,
            safeEvent.content.displayname ?? safeEvent.state_key
          )}{" "}
          {this.settings.warningText}
        </root>,
        { replyToEvent: safeEvent }
      );
      if (isError(warningResult)) {
        log.error(
          "Failed to send warning message to user",
          safeEvent.state_key,
          warningResult.error
        );
      }
    }
    if (
      numberOfChanges > this.settings.maxChangesPerUser &&
      this.consequenceBucket.getTokenCount(key) === 1
    ) {
      this.consequenceBucket.addToken(key);
      const consequenceResult =
        await this.finalConsequences.consequenceForUserInRoom(
          room.toRoomIDOrAlias(),
          safeEvent.state_key,
          this.settings.finalConsequenceReason
        );
      if (isError(consequenceResult)) {
        log.error(
          "Failed to enact consequence for user",
          safeEvent.state_key,
          consequenceResult.error
        );
      }
    }
    return Ok(undefined);
  }

  public handleProtectionDisable(): void {
    this.changeBucket.stop();
    this.consequenceBucket.stop();
  }

  private timescaleMilliseconds(): number {
    return this.settings.timescaleMinutes * ONE_MINUTE;
  }
}

export type MembershipChangeProtectionCapabilities = {
  finalConsequences: UserConsequences;
};

describeProtection<
  MembershipChangeProtectionCapabilities,
  Draupnir,
  typeof MembershipChangeProtectionSettings
>({
  name: MembershipChangeProtection.name,
  description: `A protection that will rate limit the number of changes a single user can make to their membership event. Experimental.`,
  capabilityInterfaces: {
    finalConsequences: "UserConsequences",
  },
  defaultCapabilities: {
    finalConsequences: "StandardUserConsequences",
  },
  configSchema: MembershipChangeProtectionSettings,
  factory: (
    description,
    protectedRoomsSet,
    draupnir,
    capabilitySet,
    settings
  ) =>
    Ok(
      new MembershipChangeProtection(
        description,
        capabilitySet,
        protectedRoomsSet,
        draupnir.clientPlatform.toRoomMessageSender(),
        settings
      )
    ),
});
