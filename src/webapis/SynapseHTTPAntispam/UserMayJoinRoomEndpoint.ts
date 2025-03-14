// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Type } from "@sinclair/typebox";
import {
  EDStatic,
  isError,
  Logger,
  StringRoomIDSchema,
  StringUserIDSchema,
  Task,
  Value,
} from "matrix-protection-suite";
import { SpamCheckEndpointPluginManager } from "./SpamCheckEndpointPluginManager";
import { Request, Response } from "express";

const log = new Logger("UserMayJoinRoomEndpoint");

export type UserMayJoinRoomListenerArguments = Parameters<
  (details: UserMayJoinRoomRequestBody) => void
>;

type UserMayJoinRoomRequestBody = EDStatic<typeof UserMayJoinRoomRequestBody>;
const UserMayJoinRoomRequestBody = Type.Object({
  user: StringUserIDSchema,
  room: StringRoomIDSchema,
  is_invited: Type.Boolean(),
});

export class UserMayJoinRoomEndpoint {
  public constructor(
    private readonly pluginManager: SpamCheckEndpointPluginManager<UserMayJoinRoomListenerArguments>
  ) {
    // nothing to do.
  }

  private async handleUserMayJoinRoomAsync(
    request: Request,
    response: Response,
    isResponded: boolean
  ): Promise<void> {
    const decodedBody = Value.Decode(UserMayJoinRoomRequestBody, request.body);
    if (isError(decodedBody)) {
      log.error("Error decoding request body:", decodedBody.error);
      if (!isResponded && this.pluginManager.isBlocking()) {
        response.status(400).send({
          errcode: "M_INVALID_PARAM",
          error: "Error handling user, room, and is_invited",
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

  public handleUserMayJoinRoom(request: Request, response: Response): void {
    if (!this.pluginManager.isBlocking()) {
      response.status(200);
      response.send({});
    }
    void Task(
      this.handleUserMayJoinRoomAsync(
        request,
        response,
        !this.pluginManager.isBlocking()
      )
    );
  }
}
