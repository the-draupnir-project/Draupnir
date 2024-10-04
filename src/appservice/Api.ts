// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import request from "request";
import express from "express";
import * as bodyParser from "body-parser";
import * as http from "http";
import { Logger } from "matrix-appservice-bridge";
import { AppServiceDraupnirManager } from "./AppServiceDraupnirManager";
import { isError } from "matrix-protection-suite";
import { isStringUserID } from "@the-draupnir-project/matrix-basic-types";

const log = new Logger("Api");
/**
 * This provides a web api that is designed to power the mjolnir widget https://github.com/matrix-org/mjolnir-widget.
 */
export class Api {
  private httpdConfig: express.Express = express();
  private httpServer?: http.Server;

  constructor(
    private homeserver: string,
    private mjolnirManager: AppServiceDraupnirManager
  ) {}

  /**
   * Resolves an open id access token to find a matching user that the token is valid for.
   * @param accessToken An openID token.
   * @returns The mxid of the user that this token belongs to or null if the token could not be authenticated.
   */
  private resolveAccessToken(accessToken: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      request(
        {
          url: `${this.homeserver}/_matrix/federation/v1/openid/userinfo`,
          qs: { access_token: accessToken },
        },
        (err, homeserver_response, body) => {
          if (err) {
            log.error(
              `Error resolving openID token from ${this.homeserver}`,
              err
            );
            if (err instanceof Error) {
              reject(err);
            } else {
              reject(
                new Error(
                  `There was an error when resolving openID token from ${this.homeserver}`
                )
              );
            }
          }
          let response: { sub: string };
          try {
            response = JSON.parse(body);
          } catch (e) {
            log.error(
              `Received ill formed response from ${this.homeserver} when resolving an openID token`,
              e
            );
            if (err instanceof Error) {
              reject(err);
            }
            reject(
              new Error(
                `Received ill formed response from ${this.homeserver} when resolving an openID token ${e}`
              )
            );
            return;
          }

          resolve(response.sub);
        }
      );
    });
  }

  public async close(): Promise<void> {
    await new Promise((resolve, reject) => {
      if (!this.httpServer) {
        throw new TypeError("Server was never started");
      }
      this.httpServer.close((error) => {
        error ? reject(error) : resolve(undefined);
      });
    });
  }

  public start(port: number) {
    if (this.httpServer) {
      throw new TypeError("server already started");
    }
    this.httpdConfig.use(bodyParser.json());

    this.httpdConfig.get("/get", this.pathGet.bind(this));
    this.httpdConfig.get("/list", this.pathList.bind(this));
    this.httpdConfig.post("/create", this.pathCreate.bind(this));
    this.httpdConfig.post("/join", this.pathJoin.bind(this));

    this.httpServer = this.httpdConfig.listen(port);
  }

  /**
   * Finds the management room for a draupnir.
   * @param req.body.openId An OpenID token to verify that the sender of the request owns the draupnir described in `req.body.mxid`.
   * @param req.body.mxid   The mxid of the draupnir we want to find the management room for.
   */
  private async pathGet(req: express.Request, response: express.Response) {
    const accessToken = req.body["openId"];
    if (accessToken === undefined) {
      response.status(401).send("unauthorised");
      return;
    }

    const userId = await this.resolveAccessToken(accessToken);
    if (userId === null) {
      response.status(401).send("unauthorised");
      return;
    }
    if (!isStringUserID(userId)) {
      response.status(400).send("invalid user mxid");
      return;
    }

    const mjolnirId = req.body["mxid"];
    if (mjolnirId === undefined || !isStringUserID(mjolnirId)) {
      response.status(400).send("invalid request");
      return;
    }

    const mjolnir = await this.mjolnirManager.getRunningDraupnir(
      mjolnirId,
      userId
    );
    if (mjolnir === undefined) {
      response.status(400).send("unknown draupnir mxid");
      return;
    }

    response.status(200).json({ managementRoom: mjolnir.managementRoomID });
  }

  /**
   * Return the mxids of draupnirs that this user has provisioned.
   * @param req.body.openId An OpenID token to find the sender of the request with and find their provisioned draupnirs.
   */
  private async pathList(req: express.Request, response: express.Response) {
    const accessToken = req.body["openId"];
    if (accessToken === undefined) {
      response.status(401).send("unauthorised");
      return;
    }

    const userId = await this.resolveAccessToken(accessToken);
    if (userId === null) {
      response.status(401).send("unauthorised");
      return;
    }
    if (!isStringUserID(userId)) {
      response.status(400).send("invalid user mxid");
      return;
    }

    const existing = this.mjolnirManager.getOwnedDraupnir(userId);
    response.status(200).json(existing);
  }

  /**
   * Creates a new draupnir for the requesting user and protects their first room.
   * @param req.body.roomId The room id that the request to create a draupnir originates from.
   * This is so that draupnir can protect the room once the authenticity of the request has been verified.
   * @param req.body.openId An OpenID token to find the sender of the request with.
   */
  private async pathCreate(req: express.Request, response: express.Response) {
    const accessToken = req.body["openId"];
    if (accessToken === undefined) {
      response.status(401).send("unauthorised");
      return;
    }

    const roomId = req.body["roomId"];
    if (roomId === undefined) {
      response.status(400).send("invalid request");
      return;
    }

    const userId = await this.resolveAccessToken(accessToken);
    if (userId === null) {
      response.status(401).send("unauthorised");
      return;
    }
    if (!isStringUserID(userId)) {
      response.status(400).send("invalid user mxid");
      return;
    }

    const record = await this.mjolnirManager.provisionNewDraupnir(userId);
    if (isError(record)) {
      response.status(500).send(record.error.message);
      return;
    }
    response.status(200).json({
      mxid: this.mjolnirManager.draupnirMXID(record.ok),
      roomId: record.ok.management_room,
    });
  }

  /**
   * Request a draupnir to join and protect a room.
   * @param req.body.openId An OpenID token to find the sender of the request with and that they own the draupnir described in `req.body.mxid`.
   * @param req.body.mxid   The mxid of the draupnir that should join the room.
   * @param req.body.roomId The room that this draupnir should join and protect.
   */
  private async pathJoin(req: express.Request, response: express.Response) {
    const accessToken = req.body["openId"];
    if (accessToken === undefined) {
      response.status(401).send("unauthorised");
      return;
    }

    const userId = await this.resolveAccessToken(accessToken);
    if (userId === null) {
      response.status(401).send("unauthorised");
      return;
    }
    if (!isStringUserID(userId)) {
      response.status(400).send("invalid user mxid");
      return;
    }

    const mjolnirId = req.body["mxid"];
    if (mjolnirId === undefined || !isStringUserID(mjolnirId)) {
      response.status(400).send("invalid request");
      return;
    }

    const roomId = req.body["roomId"];
    if (roomId === undefined) {
      response.status(400).send("invalid request");
      return;
    }

    // TODO: getMjolnir can fail if the ownerId doesn't match the requesting userId.
    // https://github.com/matrix-org/mjolnir/issues/408
    const mjolnir = await this.mjolnirManager.getRunningDraupnir(
      mjolnirId,
      userId
    );
    if (mjolnir === undefined) {
      response.status(400).send("unknown draupnir mxid");
      return;
    }

    await mjolnir.client.joinRoom(roomId);
    await mjolnir.protectedRoomsSet.protectedRoomsManager.addRoom(roomId);

    response.status(200).json({});
  }
}
