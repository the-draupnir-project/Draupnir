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
  MatrixSendClient,
  resultifyBotSDKRequestErrorWith404AsUndefined,
  SynapseAdminClient,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import { ReportManager } from "./ReportManager";
import { LogLevel } from "@vector-im/matrix-bot-sdk";
import ManagementRoomOutput from "../managementroom/ManagementRoomOutput";
import { Draupnir } from "../Draupnir";
import {
  ActionException,
  ActionExceptionKind,
  Ok,
  RoomEvent,
  Task,
  isError,
} from "matrix-protection-suite";

/**
 * Synapse will tell us where we last got to on polling reports, so we need
 * to store that for pagination on further polls
 */
export const REPORT_POLL_EVENT_TYPE = "org.matrix.mjolnir.report_poll";

class InvalidStateError extends Error {}

export type ReportPollSetting = { from: number };

/**
 * A class to poll synapse's report endpoint, so we can act on new reports
 *
 * @param draupnir The running Draupnir instance
 * @param manager The report manager in to which we feed new reports
 */
export class ReportPoller {
  /**
   * https://matrix-org.github.io/synapse/latest/admin_api/event_reports.html
   * "from" is an opaque token that is returned from the API to paginate reports
   */
  private from = 0;
  /**
   * The currently-pending report poll
   */
  private timeout: ReturnType<typeof setTimeout> | null = null;

  private readonly synapseAdminClient: SynapseAdminClient;

  private readonly pollPeriod: number;

  constructor(
    private draupnir: Draupnir,
    private manager: ReportManager,
    options: { pollPeriod?: number } = {}
  ) {
    if (draupnir.synapseAdminClient === undefined) {
      throw new TypeError(
        `Unable to find synapse admin client for report poller`
      );
    }
    this.synapseAdminClient = draupnir.synapseAdminClient;
    this.pollPeriod = options.pollPeriod ?? 30_000; // a minute in milliseconds
  }

  private schedulePoll() {
    if (this.timeout === null) {
      /*
       * Important that we use `setTimeout` here, not `setInterval`,
       * because if there's networking problems and `getAbuseReports`
       * hangs for longer thank the interval, it could cause a stampede
       * of requests when networking problems resolve
       */
      this.timeout = setTimeout(() => {
        void this.tryGetAbuseReports.call(this);
      }, this.pollPeriod);
    } else {
      throw new InvalidStateError("poll already scheduled");
    }
  }

  private async getAbuseReports() {
    const response = await this.synapseAdminClient.getAbuseReports({
      direction: "f",
      from: this.from,
    });
    if (isError(response)) {
      // FIXME: There's something wrong with what is happening here.
      // We are trying to let the user know the thing is broken. Fine,
      // but this shouldn't be happening via the logMesasage utility
      // but we also just can't stop and break the thing in case the reason
      // is just an intermittent issue.
      // And that they wouldn't notice that it has stopped.
      await this.draupnir.managementRoomOutput.logMessage(
        LogLevel.ERROR,
        "getAbuseReports",
        `failed to poll events: ${response.error.toReadableString()}`
      );
      return;
    }
    for (const report of response.ok.event_reports) {
      // FIXME: shouldn't we have a SafeMatrixSendClient in the BotSDKMPS that gives us ActionResult's with
      // Decoded events.
      // Problem is that our current event model isn't going to match up with extensible events.
      const eventContext = await this.draupnir.client
        .doRequest(
          "GET",
          `/_synapse/admin/v1/rooms/${report.room_id}/context/${report.event_id}?limit=1`
        )
        .then(
          (value) => Ok(value),
          (exception: unknown) =>
            ActionException.Result(
              `Failed to retrieve the context for an event ${report.event_id}`,
              { exception, exceptionKind: ActionExceptionKind.Unknown }
            )
        );
      if (isError(eventContext)) {
        void Task(
          this.draupnir.managementRoomOutput.logMessage(
            LogLevel.ERROR,
            "getAbuseReports",
            `failed to get context: ${eventContext.error.uuid}`
          )
        );
        continue;
      }
      const event = (eventContext.ok as Record<"event", RoomEvent>).event;

      await this.manager.handleServerAbuseReport({
        roomID: report.room_id,
        reporterId: report.user_id,
        event: event,
        ...(report.reason ? { reason: report.reason } : {}),
      });
    }

    /*
     * This API endpoint returns an opaque `next_token` number that we
     * need to give back to subsequent requests for pagination, so here we
     * save it in account data. Except it's not opaque, and there's no way
     * to use this API as a poll without cheating and using the total. Brill.
     */
    const nextToken = response.ok.next_token ?? response.ok.total ?? 0;
    if (nextToken !== this.from) {
      this.from = nextToken;
      try {
        await this.draupnir.client.setAccountData(REPORT_POLL_EVENT_TYPE, {
          from: nextToken,
        });
      } catch (e) {
        const error = new ActionException(
          ActionExceptionKind.Unknown,
          e,
          "Unable to set account data for report poller token"
        );
        await this.draupnir.managementRoomOutput.logMessage(
          LogLevel.ERROR,
          "getAbuseReports",
          `failed to update progress, provide the administrator with this reference for details: ${error.uuid}`
        );
      }
    }
  }

  private async tryGetAbuseReports() {
    this.timeout = null;

    try {
      await this.getAbuseReports();
    } catch (e) {
      const error = new ActionException(
        ActionExceptionKind.Unknown,
        e,
        "failed to get abuse reports"
      );
      await this.draupnir.managementRoomOutput.logMessage(
        LogLevel.ERROR,
        "tryGetAbuseReports",
        `failed to get abuse reports: ${error.uuid}`
      );
    }

    this.schedulePoll();
  }
  public static async getReportPollSetting(
    client: MatrixSendClient,
    _managementRoomOutput: ManagementRoomOutput
  ): Promise<ReportPollSetting> {
    const reportPollAccountData = (
      await client
        .getAccountData(REPORT_POLL_EVENT_TYPE)
        .then(
          (value) => Ok(value),
          resultifyBotSDKRequestErrorWith404AsUndefined
        )
    ).expect("Unable to fetch report poll setting");
    if (reportPollAccountData === undefined) {
      return { from: 0 };
    }
    if (
      typeof reportPollAccountData !== "object" ||
      reportPollAccountData === null ||
      !("from" in reportPollAccountData) ||
      !Number.isInteger(reportPollAccountData.from)
    ) {
      throw new TypeError("report poll setting is corrupted");
    }
    return reportPollAccountData as ReportPollSetting;
  }

  public async startFromStoredSetting(
    client: MatrixSendClient,
    managementRoomOutput: ManagementRoomOutput
  ): Promise<void> {
    const reportPollSetting = await ReportPoller.getReportPollSetting(
      client,
      managementRoomOutput
    );
    this.start(reportPollSetting);
  }

  public start({ from: startFrom }: ReportPollSetting) {
    if (this.timeout === null) {
      this.from = startFrom;
      this.schedulePoll();
    } else {
      throw new InvalidStateError("cannot start an already started poll");
    }
  }
  public stop() {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    } else {
      throw new InvalidStateError("cannot stop a poll that hasn't started");
    }
  }
}
