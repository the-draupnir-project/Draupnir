// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { SpamCheckEndpointPluginManager } from "./SpamCheckEndpointPluginManager";
import { Request, Response } from "express";
import {
  EDStatic,
  isError,
  Logger,
  StringRoomIDSchema,
  StringUserIDSchema,
  Task,
  Value,
} from "matrix-protection-suite";
import { Type } from "@sinclair/typebox";

// for check_event_for_spam we will leave the event as unparsed

const log = new Logger("UserMayInviteEndpoint");

export type UserMayInviteListenerArguments = Parameters<
  (details: UserMayInviteRequestBody) => void
>;

type UserMayInviteRequestBody = EDStatic<typeof UserMayInviteRequestBody>;
const UserMayInviteRequestBody = Type.Object({
  inviter: StringUserIDSchema,
  invitee: StringUserIDSchema,
  room_id: StringRoomIDSchema,
});

export type UserMayInvitePluginManager =
  SpamCheckEndpointPluginManager<UserMayInviteListenerArguments>;
export class UserMayInviteEndpoint {
  public constructor(
    private readonly pluginManager: SpamCheckEndpointPluginManager<UserMayInviteListenerArguments>
  ) {
    // nothing to do.
  }

  private async handleUserMayInviteAsync(
    request: Request,
    response: Response,
    isResponded: boolean
  ): Promise<void> {
    const decodedBody = Value.Decode(UserMayInviteRequestBody, request.body);
    if (isError(decodedBody)) {
      log.error("Error decoding request body:", decodedBody.error);
      if (!isResponded && this.pluginManager.isBlocking()) {
        response.status(400).send({
          errcode: "M_INVALID_PARAM",
          error: "Error handling inviter, invitee, and room_id",
        });
      }
      return;
    }
    if (!isResponded && this.pluginManager.isBlocking()) {
      const blockingResult = await this.pluginManager.callBlockingHandles(
        decodedBody.ok
      );
      if (blockingResult === "NOT_SPAM") {
        response.status(200);
        response.send({});
      } else {
        response.status(400);
        response.send(blockingResult);
      }
    } else if (!isResponded) {
      response.status(200);
      response.send({});
    }
    this.pluginManager.callNonBlockingHandlesInTask(decodedBody.ok);
  }

  public handleUserMayInvite(request: Request, response: Response): void {
    if (!this.pluginManager.isBlocking()) {
      response.status(200);
      response.send({});
    }
    void Task(
      this.handleUserMayInviteAsync(
        request,
        response,
        !this.pluginManager.isBlocking()
      )
    );
  }
}
