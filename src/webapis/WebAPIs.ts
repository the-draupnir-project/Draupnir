// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Server } from "http";
import express from "express";
import { MatrixClient } from "matrix-bot-sdk";
import { ReportManager } from "../report/ReportManager";
import { IConfig } from "../config";
import {
  StringRoomID,
  StringEventID,
  isStringRoomID,
  isStringEventID,
} from "@the-draupnir-project/matrix-basic-types";
import { Logger, Task } from "matrix-protection-suite";

const log = new Logger("WebAPIs");

/**
 * A common prefix for all web-exposed APIs.
 */
const API_PREFIX = "/api/1";

const AUTHORIZATION = new RegExp("Bearer (.*)");

export class WebAPIs {
  private webController: express.Express = express();
  private httpServer?: Server | undefined;
  /**
   * This is a debug utility that we use to test whether we can poll for reports without breaking the harness
   * or dynamically changing draupnir's config.
   */
  private isHandlingReports: boolean;

  constructor(
    private reportManager: ReportManager,
    private readonly config: IConfig,
    private readonly options?: { isHandlingReports?: boolean }
  ) {
    // Setup JSON parsing.
    this.webController.use(express.json());
    if (this.options?.isHandlingReports === undefined) {
      this.isHandlingReports = true;
    } else {
      this.isHandlingReports = this.options.isHandlingReports;
    }
  }

  /**
   * Start accepting requests to the Web API.
   */
  public async start(): Promise<void> {
    if (!this.config.web.enabled) {
      return;
    }
    await new Promise((resolve) => {
      this.httpServer = this.webController.listen(
        this.config.web.port,
        this.config.web.address,
        () => {
          resolve(undefined);
        }
      );
    });
    // configure /report API.
    if (this.config.web.abuseReporting.enabled) {
      log.info(`configuring ${API_PREFIX}/report/:room_id/:event_id...`);
      this.webController.options(
        `${API_PREFIX}/report/:room_id/:event_id`,
        (request, response) => {
          // reply with CORS options
          response.header("Access-Control-Allow-Origin", "*");
          response.header(
            "Access-Control-Allow-Headers",
            "X-Requested-With, Content-Type, Authorization, Date"
          );
          response.header("Access-Control-Allow-Methods", "POST, OPTIONS");
          response.status(200);
          return response.send();
        }
      );
      this.webController.post(
        `${API_PREFIX}/report/:room_id/:event_id`,
        (request, response) => {
          log.debug(
            `Received a message on ${API_PREFIX}/report/:room_id/:event_id`,
            request.params
          );
          // set CORS headers for the response
          response.header("Access-Control-Allow-Origin", "*");
          response.header(
            "Access-Control-Allow-Headers",
            "X-Requested-With, Content-Type, Authorization, Date"
          );
          response.header("Access-Control-Allow-Methods", "POST, OPTIONS");
          const roomID = request.params.room_id;
          const eventID = request.params.event_id;
          if (!isStringRoomID(roomID)) {
            log.error(
              `Invalid roomID provided when processing a report, check your webproxy: ${roomID}`
            );
            response
              .status(400)
              .send({ errcode: "M_INVALID_PARAM", error: "Invalid room ID" });
            return;
          }
          if (!isStringEventID(eventID)) {
            log.error(
              `Invalid eventID provided when processing a report, check your webproxy: ${eventID}`
            );
            response
              .status(400)
              .send({ errcode: "M_INVALID_PARAM", error: "Invalid event ID" });
            return;
          }
          void Task(
            this.handleReport({
              request,
              response,
              roomID,
              eventID,
            })
          );
        }
      );
      log.info(`configuring ${API_PREFIX}/report/:room_id/:event_id... DONE`);
    }
  }

  public async stop(): Promise<void> {
    if (this.httpServer) {
      log.info("Stopping WebAPIs.");
      await new Promise((resolve, reject) => {
        if (this.httpServer === undefined) {
          throw new TypeError("There is some kind of weird race going on here");
        }
        this.httpServer.close((error) => {
          if (error === undefined) {
            resolve(undefined);
          } else if (
            "code" in error &&
            error.code === "ERR_SERVER_NOT_RUNNING"
          ) {
            resolve(undefined);
          } else {
            log.error("Error when stopping WebAPIs", error);
            reject(error);
          }
        });
      });
      this.httpServer = undefined;
    }
  }

  /**
   * Handle a call to the /report API.
   *
   * In case of success, respond an empty JSON body.
   *
   * @param roomId The room in which the reported event took place. Already extracted from the URL.
   * @param eventId The event. Already extracted from the URL.
   * @param request The request. Its body SHOULD hold an object `{reason?: string}`
   * @param response The response. Used to propagate HTTP success/error.
   */
  async handleReport({
    roomID,
    eventID,
    request,
    response,
  }: {
    roomID: StringRoomID;
    eventID: StringEventID;
    request: express.Request;
    response: express.Response;
  }) {
    // To display any kind of useful information, we need
    //
    // 1. The reporter id;
    // 2. The accused id, to be able to warn/kick/ban them if necessary;
    // 3. The content of the event **if the room is unencrypted**.

    try {
      let reporterId;
      let event;
      {
        // -- Create a client on behalf of the reporter.
        // We'll use it to confirm the authenticity of the report.
        let accessToken: string | undefined = undefined;

        // Authentication mechanism 1: Request header.
        const authorization = request.get("Authorization");

        if (authorization) {
          const brearerMatch = AUTHORIZATION.exec(authorization);
          if (brearerMatch === null) {
            response.status(401).send("Missing access token");
            return;
          } else {
            [, accessToken] = brearerMatch;
          }
        } else if (typeof request.query["access_token"] === "string") {
          // Authentication mechanism 2: Access token as query parameter.
          accessToken = request.query["access_token"];
        }
        if (accessToken === undefined) {
          response.status(401).send("Missing access token");
          return;
        }

        // Create a client dedicated to this report.
        //
        // VERY IMPORTANT NOTES
        //
        // We're impersonating the user to get the context of the report.
        //
        // For privacy's sake, we MUST ensure that:
        //
        // - we DO NOT sync with this client, as this would let us
        //    snoop on messages other than the context of the report;
        // - we DO NOT associate a crypto store (e.g. Pantalaimon),
        //    as this would let us read encrypted messages;
        // - this client is torn down as soon as possible to avoid
        //    any case in which it could somehow be abused if a
        //    malicious third-party gains access to Mjölnir.
        //
        // Rationales for using this mechanism:
        //
        // 1. This /report interception feature can only be setup by someone
        //    who already controls the server. In other words, if they wish
        //    to snoop on unencrypted messages, they can already do it more
        //    easily at the level of the proxy.
        // 2. The `reporterClient` is used only to provide
        //    - identity-checking; and
        //    - features that are already available in the Synapse Admin API
        //      (possibly in the Admin APIs of other homeservers, I haven't checked)
        //    so we are not extending the abilities of Mjölnir
        // 3. We are avoiding the use of the Synapse Admin API to ensure that
        //    this feature can work with all homeservers, not just Synapse.
        const reporterClient = new MatrixClient(
          this.config.rawHomeserverUrl,
          accessToken
        );
        reporterClient.start = () => {
          throw new Error("We MUST NEVER call start on the reporter client");
        };

        reporterId = await reporterClient.getUserId();

        /*
                Past this point, the following invariants hold:

                - The report was sent by a Matrix user.
                - The identity of the Matrix user who sent the report is stored in `reporterId`.
                */

        // Now, let's gather more info on the event.
        // IMPORTANT: The following call will return the event without decyphering it, so we're
        // not obtaining anything that we couldn't also obtain through a homeserver's Admin API.
        //
        // By doing this with the reporterClient, we ensure that this feature of Mjölnir can work
        // with all Matrix homeservers, rather than just Synapse.
        event = await reporterClient.getEvent(roomID, eventID);
      }

      const reason = request.body["reason"];
      if (this.isHandlingReports) {
        await this.reportManager.handleServerAbuseReport({
          roomID,
          reporterId,
          event,
          reason,
        });
      }
      // Match the spec behavior of `/report`: return 200 and an empty JSON.
      response.status(200).json({});
    } catch (ex) {
      log.error("Error responding to an abuse report", roomID, eventID, ex);
      response.status(503);
    }
  }
}
