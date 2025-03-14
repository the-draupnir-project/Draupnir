// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Express, Request, Response } from "express";
import { SpamCheckEndpointPluginManager } from "./SpamCheckEndpointPluginManager";
import {
  UserMayInviteEndpoint,
  UserMayInviteListenerArguments,
} from "./UserMayInviteEndpoint";
import {
  UserMayJoinRoomEndpoint,
  UserMayJoinRoomListenerArguments,
} from "./UserMayJoinRoomEndpoint";
import {
  CheckEventForSpamEndpoint,
  CheckEventForSpamListenerArguments,
} from "./CheckEventForSpamEndpoint";

const SPAM_CHECK_PREFIX = "/api/1/spam_check";
const AUTHORIZATION = new RegExp("Bearer (.*)");

function makeAuthenticatedEndpointHandler(
  secret: string,
  cb: (request: Request, response: Response) => void
): (request: Request, response: Response) => void {
  return function (request, response) {
    const authorization = request.get("Authorization");
    if (!authorization) {
      response.status(401).send("Missing access token");
      return;
    }
    const [, accessToken] = AUTHORIZATION.exec(authorization) ?? [];
    if (accessToken !== secret) {
      response.status(401).send("Missing access token");
      return;
    }
    cb(request, response);
  };
}

export class SynapseHttpAntispam {
  public readonly userMayInviteHandles =
    new SpamCheckEndpointPluginManager<UserMayInviteListenerArguments>();
  private readonly userMayInviteEndpoint = new UserMayInviteEndpoint(
    this.userMayInviteHandles
  );
  public readonly userMayJoinRoomHandles =
    new SpamCheckEndpointPluginManager<UserMayJoinRoomListenerArguments>();
  private readonly userMayJoinRoomEndpoint = new UserMayJoinRoomEndpoint(
    this.userMayJoinRoomHandles
  );
  public readonly checkEventForSpamHandles =
    new SpamCheckEndpointPluginManager<CheckEventForSpamListenerArguments>();
  private readonly checkEventForSpamEndpoint = new CheckEventForSpamEndpoint(
    this.checkEventForSpamHandles
  );
  public constructor(
    private readonly webController: Express,
    private readonly secret: string
  ) {
    // nothing to do
  }

  public register(): void {
    this.webController.post(
      `${SPAM_CHECK_PREFIX}/user_may_invite`,
      makeAuthenticatedEndpointHandler(this.secret, (request, response) => {
        this.userMayInviteEndpoint.handleUserMayInvite(request, response);
      })
    );
    this.webController.post(
      `${SPAM_CHECK_PREFIX}/user_may_join_room`,
      makeAuthenticatedEndpointHandler(this.secret, (request, response) => {
        this.userMayJoinRoomEndpoint.handleUserMayJoinRoom(request, response);
      })
    );
    this.webController.post(
      `${SPAM_CHECK_PREFIX}/check_event_for_spam`,
      makeAuthenticatedEndpointHandler(this.secret, (request, response) => {
        this.checkEventForSpamEndpoint.handleCheckEventForSpam(
          request,
          response
        );
      })
    );
  }
}
