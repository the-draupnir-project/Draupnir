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
import { StandardReportManager } from "../report/ReportManager";
import { WebserverConfig } from "../config";
import {
  StringRoomID,
  StringEventID,
  isStringRoomID,
  isStringEventID,
  isStringUserID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { isError, Logger, Task } from "matrix-protection-suite";
import { SynapseHttpAntispam } from "./SynapseHTTPAntispam/SynapseHttpAntispam";
import { AppServiceDraupnirManager } from "../appservice/AppServiceDraupnirManager";
import { resolveOpenIDToken } from "../utils";

const log = new Logger("WebAPIs");

/**
 * A common prefix for all web-exposed APIs.
 */
const API_PREFIX = "/api/1";

const APPSERVICE_API_PREFIX = "/api/1/appservice";

const AUTHORIZATION = new RegExp("Bearer (.*)");

export class WebAPIs {
  private webController: express.Express = express();
  private httpServer?: Server | undefined;

  constructor(
    private readonly rawHomeserverUrl: string,
    private readonly config: WebserverConfig,
    private reportManager?: StandardReportManager,
    private readonly synapseHTTPAntispam?: SynapseHttpAntispam | undefined,
    private draupnirManager?: AppServiceDraupnirManager
  ) {
    // Setup JSON parsing.
    this.webController.use(express.json());
    this.synapseHTTPAntispam?.register(this.webController);
  }

  /**
   * Start accepting requests to the Web API.
   */
  public async start(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    await new Promise((resolve) => {
      this.httpServer = this.webController.listen(
        this.config.port,
        this.config.address,
        () => {
          resolve(undefined);
        }
      );
    });

    // Setup cors
    this.webController.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Authorization");
      res.header(
        "Access-Control-Allow-Methods",
        "OPTIONS, GET, POST, PUT, DELETE"
      );

      if (req.method === "OPTIONS") {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // configure /report API.
    if (this.config.abuseReporting.enabled && this.reportManager) {
      log.info(`configuring ${API_PREFIX}/report/:room_id/:event_id...`);
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

    // Appservice APIs
    if (this.draupnirManager) {
      // Setup API to get the information of a bot.
      log.info(`configuring ${APPSERVICE_API_PREFIX}/get/:bot_id...`);
      this.webController.get(
        `${APPSERVICE_API_PREFIX}/get/:bot_id`,
        (request, response) => {
          void Task(this.getAppserviceBotInfo(request, response));
        }
      );
      log.info(`configuring ${APPSERVICE_API_PREFIX}/get/:bot_id... DONE`);

      // Setup API to list the bots of a user.
      log.info(`configuring ${APPSERVICE_API_PREFIX}/list...`);
      this.webController.get(
        `${APPSERVICE_API_PREFIX}/list`,
        (request, response) => {
          void Task(this.listBots(request, response));
        }
      );
      log.info(`configuring ${APPSERVICE_API_PREFIX}/list... DONE`);

      // Setup API to provision a bot.
      log.info(`configuring ${APPSERVICE_API_PREFIX}/provision...`);
      this.webController.post(
        `${APPSERVICE_API_PREFIX}/provision`,
        (request, response) => {
          void Task(this.handleProvision(request, response));
        }
      );
      log.info(`configuring ${APPSERVICE_API_PREFIX}/provision... DONE`);
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

  // TODO: Return matrix style errros everywhere!!!!!!!!!!!!!!!!!!!!!!!!!!!

  private async ensureLoggedIn(
    request: express.Request,
    response: express.Response
  ): Promise<StringUserID | undefined> {
    // Get OpenID token from the request header
    const authorization = request.get("Authorization");

    let openIDToken: string | undefined = undefined;

    if (authorization) {
      const brearerMatch = AUTHORIZATION.exec(authorization);
      if (brearerMatch === null) {
        response.status(401).send({
          errcode: "M_MISSING_TOKEN",
          error: "Missing access token",
        });
        return;
      } else {
        [, openIDToken] = brearerMatch;
      }
    }

    if (!openIDToken) {
      // If no token is provided, return 401 Unauthorized
      response.status(401).send({
        errcode: "M_MISSING_TOKEN",
        error: "Missing access token",
      });
      return;
    }

    // Resolve it on the homeserver to validate it
    const userId = await resolveOpenIDToken(this.rawHomeserverUrl, openIDToken);
    if (userId === null) {
      response.status(401).send({
        errcode: "M_MISSING_TOKEN",
        error: "Missing access token",
      });
      return;
    }

    if (!isStringUserID(userId)) {
      response.status(400).send({
        errcode: "M_INVALID_PARAM",
        error: "Invalid user ID",
      });
      return;
    }

    return userId;
  }

  /**
   * Handle a call to the /getBot API. This is used to get the management room ID of a bot.
   *
   * @param request The request object. It should contain the bot ID in the URL parameters.
   * @param response The response object. Used to send the response back to the client.
   * @returns A promise that resolves when the response has been sent.
   */
  private async getAppserviceBotInfo(
    request: express.Request,
    response: express.Response
  ): Promise<void> {
    const userId = await this.ensureLoggedIn(request, response);
    if (userId === undefined) {
      return;
    }

    if (!this.draupnirManager) {
      log.error(
        "Received a request for bot information but the appservice manager is not configured. Ignoring."
      );
      response.status(503).send({
        errcode: "M_NOT_CONFIGURED",
        error: "Appservice manager not configured",
      });
      return;
    }

    // Get the bot ID from the request parameters
    const botID = request.params.bot_id;
    if (!botID) {
      response.status(400).send({
        errcode: "M_MISSING_PARAM",
        error: "Missing bot ID",
      });
      return;
    }
    // Validate the bot ID
    if (!isStringUserID(botID)) {
      response.status(400).send({
        errcode: "M_INVALID_PARAM",
        error: "Invalid bot ID",
      });
      return;
    }

    const draupnir = await this.draupnirManager.getRunningDraupnir(
      botID,
      userId
    );
    if (draupnir === undefined) {
      response.status(404).send({
        errcode: "M_NOT_FOUND",
        error: "Bot not found",
      });
      return;
    }

    response.status(200).json({
      managementRoom: draupnir.managementRoomID,
      // TODO: This should be fetched properly in the future. This is important as I want to ensure that any user in the management room can use this API
      ownerID: userId,
    });
  }

  private async listBots(
    request: express.Request,
    response: express.Response
  ): Promise<void> {
    const userId = await this.ensureLoggedIn(request, response);
    if (userId === undefined) {
      return;
    }

    if (!this.draupnirManager) {
      log.error(
        "Received a request for bot information but the appservice manager is not configured. Ignoring."
      );
      response.status(503).send({
        errcode: "M_NOT_CONFIGURED",
        error: "Appservice manager not configured",
      });
      return;
    }

    // Check if there is a query parameter "onlyOwner" and if it is set to true
    const onlyOwner = request.query["onlyOwner"] === "true";

    // Get the list of bots for the user. We first do the onlyOwner case as its simpler and faster
    const draupnirBots = await this.draupnirManager.getOwnedDraupnir(userId);

    if (!onlyOwner) {
      // TODO: Fetch the list of all bots the user is member of the management room.
    }

    response.status(200).json({
      bots: draupnirBots,
    });
  }

  private async handleProvision(
    request: express.Request,
    response: express.Response
  ): Promise<void> {
    const userId = await this.ensureLoggedIn(request, response);
    if (userId === undefined) {
      return;
    }

    if (!this.draupnirManager) {
      log.error(
        "Received a request for bot information but the appservice manager is not configured. Ignoring."
      );
      response.status(503).send({
        errcode: "M_NOT_CONFIGURED",
        error: "Appservice manager not configured",
      });
      return;
    }

    // Check if the body contains an optional array of room ids to protect
    const roomsToProtect = request.body["protectedRooms"];
    if (roomsToProtect && !Array.isArray(roomsToProtect)) {
      response.status(400).send({
        errcode: "M_INVALID_PARAM",
        error: "Invalid parameter: protectedRooms must be an array of room IDs",
      });
      return;
    }

    // Provision the bot
    const record = await this.draupnirManager.provisionNewDraupnir(userId);
    if (isError(record)) {
      log.error("Error provisioning a new bot", record);
      response.status(503).send({
        errcode: "M_INTERNAL_SERVER_ERROR",
        error: "Failed to provision a new bot",
      });
      return;
    }

    const managementRoomID = record.ok.management_room;
    const botID = this.draupnirManager.draupnirMXID(record.ok);
    const ownerID = record.ok.owner;

    // If the user provided a list of rooms to protect, we need to add them to the bot
    if (roomsToProtect) {
      const invalidIDs = [];
      const failedIDs = [];
      for (const roomId of roomsToProtect) {
        if (!isStringRoomID(roomId)) {
          invalidIDs.push(roomId);
          continue;
        }
        const draupnir = await this.draupnirManager.getRunningDraupnir(
          botID,
          userId
        );
        if (draupnir === undefined) {
          log.error(
            "Received a request to protect a room but the draupnir is not running. Unable to continue."
          );
          response.status(503).send({
            errcode: "M_UNKOWN",
            error:
              "Failed to protect rooms because draupnir is not running. Unable to continue.",
          });
          return;
        }

        const joiner = draupnir.clientPlatform.toRoomJoiner();
        const room = await joiner.joinRoom(roomId);
        if (isError(room)) {
          failedIDs.push(roomId);
          continue;
        }

        const result =
          await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
            room.ok
          );
        if (isError(result)) {
          failedIDs.push(roomId);
          continue;
        }
      }

      if (invalidIDs.length > 0 || failedIDs.length > 0) {
        response.status(400).send({
          errcode: "M_INVALID_PARAM",
          error:
            "Some of the provided room IDs are invalid or failed to be protected",
          invalidIDs,
          failedIDs,
        });
        return;
      }
    }

    response.status(200).json({
      managementRoom: managementRoomID,
      botID,
      ownerID,
    });
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
    if (!this.reportManager) {
      log.error(
        "Received a report but the report manager is not configured. Ignoring."
      );
      response.status(503).send("Report manager not configured");
      return;
    }

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
        //    malicious third-party gains access to Draupnir.
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
        //    so we are not extending the abilities of Draupnir
        // 3. We are avoiding the use of the Synapse Admin API to ensure that
        //    this feature can work with all homeservers, not just Synapse.
        const reporterClient = new MatrixClient(
          this.rawHomeserverUrl,
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
        // By doing this with the reporterClient, we ensure that this feature of Draupnir can work
        // with all Matrix homeservers, rather than just Synapse.
        event = await reporterClient.getEvent(roomID, eventID);
      }
      const reason = request.body["reason"];
      await this.reportManager.handleServerAbuseReport({
        roomID,
        reporterId,
        event,
        reason,
      });

      // Match the spec behavior of `/report`: return 200 and an empty JSON.
      response.status(200).json({});
    } catch (ex) {
      log.error("Error responding to an abuse report", roomID, eventID, ex);
      response.status(503);
    }
  }
}
