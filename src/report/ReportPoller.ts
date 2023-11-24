/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2022 The Matrix.org Foundation C.I.C.

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

import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { ReportManager } from './ReportManager';
import { LogLevel, LogService } from "matrix-bot-sdk";
import ManagementRoomOutput from "../ManagementRoomOutput";
import { Draupnir } from "../Draupnir";
import { ActionException, ActionExceptionKind, Ok, SynapseReport, Value, isError } from "matrix-protection-suite";

/**
 * Synapse will tell us where we last got to on polling reports, so we need
 * to store that for pagination on further polls
 */
export const REPORT_POLL_EVENT_TYPE = "org.matrix.mjolnir.report_poll";

class InvalidStateError extends Error { }

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

    constructor(
        private draupnir: Draupnir,
        private manager: ReportManager,
    ) { }

    private schedulePoll() {
        if (this.timeout === null) {
            /*
             * Important that we use `setTimeout` here, not `setInterval`,
             * because if there's networking problems and `getAbuseReports`
             * hangs for longer thank the interval, it could cause a stampede
             * of requests when networking problems resolve
             */
            this.timeout = setTimeout(
                this.tryGetAbuseReports.bind(this),
                30_000 // a minute in milliseconds
            );
        } else {
            throw new InvalidStateError("poll already scheduled");
        }
    }

    private async getAbuseReports() {
        let response_: {
            event_reports: unknown[],
            next_token: number | undefined
        } | undefined;
        try {
            response_ = await this.draupnir.client.doRequest(
                "GET",
                "/_synapse/admin/v1/event_reports",
                {
                    // short for direction: forward; i.e. show newest last
                    dir: "f",
                    from: this.from.toString()
                }
            );
        } catch (ex) {
            await this.draupnir.managementRoomOutput.logMessage(LogLevel.ERROR, "getAbuseReports", `failed to poll events: ${ex}`);
            return;
        }

        const response = response_!;
        for (const rawReport of response.event_reports) {
            const reportResult = Value.Decode(SynapseReport, rawReport);
            if (isError(reportResult)) {
                LogService.error('ReportPoller', `Failed to decode a synapse report ${reportResult.error.uuid}`, rawReport);
                continue;
            }
            const report = reportResult.ok;
            if (!this.draupnir.protectedRoomsSet.isProtectedRoom(report.room_id)) {
                continue;
            }
            // FIXME: shouldn't we have a SafeMatrixSendClient in the BotSDKMPS that gives us ActionResult's with
            // Decoded events.
            // Problem is that our current event model isn't going to match up with extensible events.
            const eventContext = await this.draupnir.client.doRequest(
                "GET",
                `/_synapse/admin/v1/rooms/${report.room_id}/context/${report.event_id}?limit=1`
            ).then(
                (value) => Ok(value),
                (exception) => ActionException.Result(`Failed to retrieve the context for an event ${report.event_id}`, { exception, exceptionKind: ActionExceptionKind.Unknown })
            )
            if (isError(eventContext)) {
                this.draupnir.managementRoomOutput.logMessage(LogLevel.ERROR, "getAbuseReports", `failed to get context: ${eventContext.error.uuid}`);
                continue;
            }
            const event = eventContext.ok.event;

            await this.manager.handleServerAbuseReport({
                roomID: report.room_id,
                reporterId: report.sender,
                event: event,
                reason: report.reason ?? undefined,
            });
        }

        /*
         * This API endpoint returns an opaque `next_token` number that we
         * need to give back to subsequent requests for pagination, so here we
         * save it in account data
         */
        if (response.next_token !== undefined) {
            this.from = response.next_token;
            try {
                await this.draupnir.client.setAccountData(REPORT_POLL_EVENT_TYPE, { from: response.next_token });
            } catch (ex) {
                await this.draupnir.managementRoomOutput.logMessage(LogLevel.ERROR, "getAbuseReports", `failed to update progress: ${ex}`);
            }
        }
    }

    private async tryGetAbuseReports() {
        this.timeout = null;

        try {
            await this.getAbuseReports()
        } catch (ex) {
            await this.draupnir.managementRoomOutput.logMessage(LogLevel.ERROR, "tryGetAbuseReports", `failed to get abuse reports: ${ex}`);
        }

        this.schedulePoll();
    }
    public static async getReportPollSetting(client: MatrixSendClient, managementRoomOutput: ManagementRoomOutput): Promise<ReportPollSetting> {
        let reportPollSetting: ReportPollSetting = { from: 0 };
        try {
            reportPollSetting = await client.getAccountData(REPORT_POLL_EVENT_TYPE);
        } catch (err) {
            if (err.body?.errcode !== "M_NOT_FOUND") {
                throw err;
            } else {
                managementRoomOutput.logMessage(LogLevel.INFO, "Mjolnir@startup", "report poll setting does not exist yet");
            }
        }
        return reportPollSetting;
    }
    public start({from: startFrom }: ReportPollSetting) {
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
