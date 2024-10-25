// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  AbstractProtection,
  ActionResult,
  CapabilitySet,
  EDStatic,
  Logger,
  MembershipChange,
  MembershipChangeType,
  Ok,
  ProtectedRoomsSet,
  ProtectionDescription,
  RoomMembershipRevision,
  describeProtection,
  isError,
} from "matrix-protection-suite";
import { LogLevel } from "matrix-bot-sdk";
import { Draupnir } from "../Draupnir";
import { DraupnirProtection } from "./Protection";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";

const log = new Logger("JoinWaveShortCircuitProtection");

const DEFAULT_MAX_PER_TIMESCALE = 50;
const DEFAULT_TIMESCALE_MINUTES = 60;
const ONE_MINUTE = 60_000; // 1min in ms

const JoinWaveShortCircuitProtectionSettings = Type.Object({
  maxPer: Type.Integer({ default: DEFAULT_MAX_PER_TIMESCALE }),
  timescaleMinutes: Type.Integer({ default: DEFAULT_TIMESCALE_MINUTES }),
});

type JoinWaveShortCircuitProtectionSettings = EDStatic<
  typeof JoinWaveShortCircuitProtectionSettings
>;

// TODO: Add join rule capability.
type JoinWaveShortCircuitProtectionCapabilities = Record<never, never>;

type JoinWaveShortCircuitProtectionDescription = ProtectionDescription<
  Draupnir,
  typeof JoinWaveShortCircuitProtectionSettings,
  JoinWaveShortCircuitProtectionCapabilities
>;

describeProtection<
  JoinWaveShortCircuitProtectionCapabilities,
  Draupnir,
  typeof JoinWaveShortCircuitProtectionSettings
>({
  name: "JoinWaveShortCircuitProtection",
  description:
    "If X amount of users join in Y time, set the room to invite-only.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  configSchema: JoinWaveShortCircuitProtectionSettings,
  factory: function (
    description,
    protectedRoomsSet,
    draupnir,
    capabilities,
    settings
  ) {
    const parsedSettings = description.protectionSettings.parseConfig(settings);
    if (isError(parsedSettings)) {
      return parsedSettings;
    }
    return Ok(
      new JoinWaveShortCircuitProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir,
        parsedSettings.ok
      )
    );
  },
});

export class JoinWaveShortCircuitProtection
  extends AbstractProtection<JoinWaveShortCircuitProtectionDescription>
  implements DraupnirProtection<JoinWaveShortCircuitProtectionDescription>
{
  private joinBuckets: {
    [roomID: StringRoomID]:
      | {
          lastBucketStart: Date;
          numberOfJoins: number;
        }
      | undefined;
  } = {};

  constructor(
    description: JoinWaveShortCircuitProtectionDescription,
    capabilities: CapabilitySet,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir,
    public readonly settings: JoinWaveShortCircuitProtectionSettings
  ) {
    super(description, capabilities, protectedRoomsSet, {
      requiredStatePermissions: ["m.room.join_rules"],
    });
  }
  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    const roomID = revision.room.toRoomIDOrAlias();
    for (const change of changes) {
      await this.handleMembership(roomID, change).catch((e: unknown) => {
        log.error(`Unexpected error handling memebership change`, e);
      });
    }
    return Ok(undefined);
  }

  public async handleMembership(
    roomID: StringRoomID,
    change: MembershipChange
  ): Promise<void> {
    if (change.membershipChangeType !== MembershipChangeType.Joined) {
      return;
    }

    // If either the roomId bucket didn't exist, or the bucket has expired, create a new one
    if (
      !this.joinBuckets[roomID] ||
      this.hasExpired(this.joinBuckets[roomID].lastBucketStart)
    ) {
      this.joinBuckets[roomID] = {
        lastBucketStart: new Date(),
        numberOfJoins: 0,
      };
    }

    if (++this.joinBuckets[roomID].numberOfJoins >= this.settings.maxPer) {
      await this.draupnir.managementRoomOutput.logMessage(
        LogLevel.WARN,
        "JoinWaveShortCircuit",
        `Setting ${roomID} to invite-only as more than ${this.settings.maxPer} users have joined over the last ${this.settings.timescaleMinutes} minutes (since ${this.joinBuckets[roomID].lastBucketStart.toString()})`,
        roomID
      );

      if (!this.draupnir.config.noop) {
        await this.draupnir.client.sendStateEvent(
          roomID,
          "m.room.join_rules",
          "",
          { join_rule: "invite" }
        );
      } else {
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "JoinWaveShortCircuit",
          `Tried to set ${roomID} to invite-only, but Draupnir is running in no-op mode`,
          roomID
        );
      }
    }
  }

  private hasExpired(at: Date): boolean {
    return new Date().getTime() - at.getTime() > this.timescaleMilliseconds();
  }

  private timescaleMilliseconds(): number {
    return this.settings.timescaleMinutes * ONE_MINUTE;
  }

  /**
     * Yeah i know this is evil but
     * We need to figure this out once we allow protections to have their own
     * command tables somehow.
     * which will probably entail doing the symbol case hacks from Utena for camel case etc.
    public async status(keywords, subcommands): Promise<DocumentNode> {
        const withExpired = subcommand.includes("withExpired");
        const withStart = subcommand.includes("withStart");

        let html = `<b>Short Circuit join buckets (max ${this.settings.maxPer.value} per ${this.settings.timescaleMinutes.value} minutes}):</b><br/><ul>`;
        let text = `Short Circuit join buckets (max ${this.settings.maxPer.value} per ${this.settings.timescaleMinutes.value} minutes):\n`;

        for (const roomId of Object.keys(this.joinBuckets)) {
            const bucket = this.joinBuckets[roomId];
            const isExpired = this.hasExpired(bucket.lastBucketStart);

            if (isExpired && !withExpired) {
                continue;
            }

            const startText = withStart ? ` (since ${bucket.lastBucketStart})` : "";
            const expiredText = isExpired ? ` (bucket expired since ${new Date(bucket.lastBucketStart.getTime() + this.timescaleMilliseconds())})` : "";

            html += `<li><a href="https://matrix.to/#/${roomId}">${roomId}</a>: ${bucket.numberOfJoins} joins${startText}${expiredText}.</li>`;
            text += `* ${roomId}: ${bucket.numberOfJoins} joins${startText}${expiredText}.\n`;
        }

        html += "</ul>";

        return {
            html,
            text,
        }
    }
    */
}
