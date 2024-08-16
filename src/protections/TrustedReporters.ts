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
  EventConsequences,
  EventReport,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  SafeIntegerProtectionSetting,
  StandardProtectionSettings,
  StringUserIDSetProtectionSettings,
  UserConsequences,
  describeProtection,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  StringUserID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";

const MAX_REPORTED_EVENT_BACKLOG = 20;

type TrustedReportersProtectionSettings = {
  mxids: Set<StringUserID>;
  alertThreshold: number;
  redactThreshold: number;
  banThreshold: number;
};

type TrustedReportersCapabilities = {
  userConsequences: UserConsequences;
  eventConsequences: EventConsequences;
};

type TrustedReportersDescription = ProtectionDescription<
  Draupnir,
  TrustedReportersProtectionSettings,
  TrustedReportersCapabilities
>;

describeProtection<
  TrustedReportersCapabilities,
  Draupnir,
  TrustedReportersProtectionSettings
>({
  name: "TrustedReporters",
  description:
    "Count reports from trusted reporters and take a configured action",
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
    rawSettings
  ) {
    const parsedSettings =
      description.protectionSettings.parseSettings(rawSettings);
    if (isError(parsedSettings)) {
      return parsedSettings;
    }
    return Ok(
      new TrustedReporters(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir,
        parsedSettings.ok
      )
    );
  },
  protectionSettings:
    new StandardProtectionSettings<TrustedReportersProtectionSettings>(
      {
        mxids: new StringUserIDSetProtectionSettings("mxids"),
        alertThreshold: new SafeIntegerProtectionSetting("alertThreshold"),
        redactThreshold: new SafeIntegerProtectionSetting("redactThreshold"),
        banThreshold: new SafeIntegerProtectionSetting("banThreshold"),
      },
      {
        mxids: new Set(),
        alertThreshold: 3,
        // -1 means 'disabled'
        redactThreshold: -1,
        banThreshold: -1,
      }
    ),
});

/*
 * Hold a list of users trusted to make reports, and enact consequences on
 * events that surpass configured report count thresholds
 */
export class TrustedReporters
  extends AbstractProtection<TrustedReportersDescription>
  implements Protection<TrustedReportersDescription>
{
  private recentReported = new Map<StringEventID, Set<StringUserID>>();

  private readonly userConsequences: UserConsequences;
  private readonly eventConsequences: EventConsequences;
  public constructor(
    description: TrustedReportersDescription,
    capabilities: TrustedReportersCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir,
    public readonly settings: TrustedReportersProtectionSettings
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.userConsequences = capabilities.userConsequences;
    this.eventConsequences = capabilities.eventConsequences;
  }

  public async handleEventReport(
    report: EventReport
  ): Promise<ActionResult<void>> {
    if (!this.settings.mxids.has(report.sender)) {
      // not a trusted user, we're not interested
      return Ok(undefined);
    }

    let reporters = this.recentReported.get(report.event_id);
    if (reporters === undefined) {
      // first report we've seen recently for this event
      reporters = new Set<StringUserID>();
      this.recentReported.set(report.event_id, reporters);
      if (this.recentReported.size > MAX_REPORTED_EVENT_BACKLOG) {
        // queue too big. push the oldest reported event off the queue
        const oldest = Array.from(this.recentReported.keys())[0];
        if (oldest === undefined) {
          throw new TypeError(
            `There should be a key in this queue if it's at max size`
          );
        }
        this.recentReported.delete(oldest);
      }
    }

    reporters.add(report.sender);

    const met: string[] = [];
    if (reporters.size === this.settings.alertThreshold) {
      met.push("alert");
      // do nothing. let the `sendMessage` call further down be the alert
    }
    if (reporters.size === this.settings.redactThreshold) {
      met.push("redact");
      await this.eventConsequences.consequenceForEvent(
        report.room_id,
        report.event_id,
        "abuse detected"
      );
    }
    if (reporters.size === this.settings.banThreshold) {
      met.push("ban");
      await this.userConsequences.consequenceForUserInRoom(
        report.room_id,
        report.event.sender,
        "abuse detected"
      );
    }

    if (met.length > 0) {
      await this.draupnir.client.sendMessage(
        this.draupnir.config.managementRoom,
        {
          msgtype: "m.notice",
          body:
            `message ${report.event_id} reported by ${[...reporters].join(", ")}. ` +
            `actions: ${met.join(", ")}`,
        }
      );
    }
    return Ok(undefined);
  }
}
