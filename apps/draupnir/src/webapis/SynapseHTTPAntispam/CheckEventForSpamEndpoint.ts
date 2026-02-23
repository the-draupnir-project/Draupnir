// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Type } from "@sinclair/typebox";
import {
  EDStatic,
  isError,
  Logger,
  RoomEvent,
  Task,
  Value,
} from "matrix-protection-suite";
import { SpamCheckEndpointPluginManager } from "./SpamCheckEndpointPluginManager";
import { Request, Response } from "express";

const log = new Logger("CheckEventForSpamEndpoint");

export type CheckEventForSpamListenerArguments = Parameters<
  (details: CheckEventForSpamRequestBody) => void
>;

export type CheckEventForSpamRequestBody = EDStatic<
  typeof CheckEventForSpamRequestBody
>;
export const CheckEventForSpamRequestBody = Type.Object({
  event: RoomEvent(Type.Unknown()),
});

export class CheckEventForSpamEndpoint {
  public constructor(
    private readonly pluginManager: SpamCheckEndpointPluginManager<CheckEventForSpamListenerArguments>
  ) {
    // nothing to do.
  }

  private async handleCheckEventForSpamAsync(
    request: Request,
    response: Response,
    isResponded: boolean
  ): Promise<void> {
    const decodedBody = Value.Decode(
      CheckEventForSpamRequestBody,
      request.body
    );
    if (isError(decodedBody)) {
      log.error("Error decoding request body:", decodedBody.error);
      if (!isResponded && this.pluginManager.isBlocking()) {
        response
          .status(400)
          .send({ errcode: "M_INVALID_PARAM", error: "Error handling event" });
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

  public handleCheckEventForSpam(request: Request, response: Response): void {
    if (!this.pluginManager.isBlocking()) {
      response.status(200);
      response.send({});
    }
    void Task(
      this.handleCheckEventForSpamAsync(
        request,
        response,
        !this.pluginManager.isBlocking()
      )
    );
  }
}
