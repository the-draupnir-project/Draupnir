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
  JoinRulesEvent,
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
import {
  MatrixRoomReference,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { Type } from "@sinclair/typebox";
import {
  DeadDocumentJSX,
  StandardCommandTable,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";
import { DraupnirInterfaceAdaptor } from "../commands/DraupnirCommandPrerequisites";
import { LazyLeakyBucket, LeakyBucket } from "../queues/LeakyBucket";
import { renderRoomPill } from "@the-draupnir-project/mps-interface-adaptor";

const log = new Logger("JoinWaveShortCircuitProtection");

const DEFAULT_MAX_PER_TIMESCALE = 50;
const DEFAULT_TIMESCALE_MINUTES = 60;
const ONE_MINUTE = 60_000; // 1min in ms

const JoinWaveShortCircuitProtectionSettings = Type.Object(
  {
    maxPer: Type.Integer({
      default: DEFAULT_MAX_PER_TIMESCALE,
      description:
        "The maximum number of users that can join a room in the timescaleMinutes timescale before the room is set to invite-only.",
    }),
    timescaleMinutes: Type.Integer({
      default: DEFAULT_TIMESCALE_MINUTES,
      description:
        "The timescale in minutes over which the maxPer users can join before the room is set to invite-only.",
    }),
  },
  { title: "JoinWaveShortCircuitProtectionSettings" }
);

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

export const JoinWaveCommandTable = new StandardCommandTable(
  "JoinWaveShortCircuitProtection"
);

describeProtection<
  JoinWaveShortCircuitProtectionCapabilities,
  Draupnir,
  typeof JoinWaveShortCircuitProtectionSettings
>({
  name: "JoinWaveShortCircuitProtection",
  description:
    "If a wave of users join in a given time frame, then the protection can set the room to invite-only.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  configSchema: JoinWaveShortCircuitProtectionSettings,
  factory: async function (
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
  public readonly joinBuckets: LeakyBucket<StringRoomID>;

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
    this.joinBuckets = new LazyLeakyBucket(
      this.settings.maxPer,
      this.timescaleMilliseconds()
    );
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
    const numberOfJoins = this.joinBuckets.addToken(roomID);
    if (numberOfJoins >= this.settings.maxPer) {
      // we should check that we haven't already set the room to invite only
      const revision = this.protectedRoomsSet.setRoomState.getRevision(roomID);
      if (revision === undefined) {
        throw new TypeError(
          `Shouldn't be possible to not have the room state revision for a protected room yet`
        );
      }
      const joinRules = revision.getStateEvent<JoinRulesEvent>(
        "m.room.join_rules",
        ""
      );
      if ((joinRules?.content.join_rule ?? "public") !== "public") {
        log.info(
          `Room ${roomID} is already invite-only, not changing join rules`
        );
        return;
      }
      await this.draupnir.managementRoomOutput.logMessage(
        LogLevel.WARN,
        "JoinWaveShortCircuit",
        `Setting ${roomID} to invite-only as more than ${this.settings.maxPer} users have joined over the last ${this.settings.timescaleMinutes} minutes.`,
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

  private timescaleMilliseconds(): number {
    return this.settings.timescaleMinutes * ONE_MINUTE;
  }

  public handleProtectionDisable(): void {
    this.joinBuckets.stop();
  }
}

const JoinWaveStatusCommand = describeCommand({
  summary: "Show the current status of the JoinWaveShortCircuitProtection",
  parameters: tuple(),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest
  ): Promise<Result<JoinWaveShortCircuitProtection | undefined>> {
    return Ok(
      draupnir.protectedRoomsSet.protections.findEnabledProtection(
        JoinWaveShortCircuitProtection.name
      ) as JoinWaveShortCircuitProtection | undefined
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(JoinWaveStatusCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    if (result.ok === undefined) {
      return Ok(
        <root>The JoinWaveShortCircuitProtection has not been enabled.</root>
      );
    }
    const joinBuckets = result.ok.joinBuckets.getAllTokens();
    return Ok(
      <root>
        <b>
          Recent room joins (max {result.ok.settings.maxPer} per{" "}
          {result.ok.settings.timescaleMinutes} minutes):
        </b>
        {joinBuckets.size === 0 ? (
          <p>No rooms have had join events since the protection was enabled.</p>
        ) : (
          <fragment></fragment>
        )}
        <ul>
          {[...joinBuckets.entries()].map(([roomID, joinCount]) => {
            return (
              <li>
                {renderRoomPill(MatrixRoomReference.fromRoomID(roomID, []))}{" "}
                {joinCount} joins.
              </li>
            );
          })}
        </ul>
      </root>
    );
  },
});

JoinWaveCommandTable.internCommand(JoinWaveStatusCommand, ["status"]);
