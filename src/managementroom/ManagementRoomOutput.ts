// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019, 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import * as Sentry from "@sentry/node";
import {
  LogLevel,
  LogService,
  MessageType,
  TextualMessageEventContent,
} from "matrix-bot-sdk";
import { IConfig } from "../config";
import { htmlEscape } from "../utils";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  StringRoomID,
  StringUserID,
  Permalinks,
  StringRoomAlias,
  userServerName,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { ManagementRoomDetail } from "./ManagementRoomDetail";
import { Task } from "matrix-protection-suite";

const levelToFn = {
  [LogLevel.DEBUG.toString()]: LogService.debug,
  [LogLevel.INFO.toString()]: LogService.info,
  [LogLevel.WARN.toString()]: LogService.warn,
  [LogLevel.ERROR.toString()]: LogService.error,
};

export interface ManagementRoomOutput {
  managementRoom: MatrixRoomID;
  managementRoomID: StringRoomID;
  /**
   * Log a message to the management room and the console, replaces any room ids in additionalRoomIds with pills.
   * @param level Used to determine whether to hide the message or not depending on `config.verboseLogging`.
   * @param module Used to help find where in the source the message is coming from (when logging to the console).
   * @param message The message we want to log.
   * @param additionalRoomIds The roomIds in the message that we want to be replaced by room pills.
   * @param isRecursive Whether logMessage is being called from logMessage.
   * @deprecated This is a legacy method i would really avoid using it if you can.
   */
  logMessage(
    level: LogLevel,
    module: string,
    message: string,
    additionalRoomIds?: string[] | string | null,
    isRecursive?: boolean
  ): Promise<void>;
}

/**
 * Allows the different componenets of draupnir to send messages back to the management room without introducing a dependency on the entirity of a `Draupnir` instance.
 */
export default class StandardManagementRoomOutput
  implements ManagementRoomOutput
{
  private isSuccessfullySendingMessages = false;
  constructor(
    private readonly managementRoomDetail: ManagementRoomDetail,
    private readonly clientUserID: StringUserID,
    private readonly client: MatrixSendClient,
    private readonly config: IConfig
  ) {
    // nothing to do.
  }

  public get managementRoom(): MatrixRoomID {
    return this.managementRoomDetail.managementRoom;
  }

  public get managementRoomID(): StringRoomID {
    return this.managementRoomDetail.managementRoomID;
  }

  private maybeWarnAboutPublicManagementRoom(): void {
    if (this.managementRoomDetail.isRoomPublic()) {
      void Task(
        this.logMessage(
          LogLevel.WARN,
          "ManagementRoom",
          "Your management room is public! You should review the join rule of your Matrix room immediately and set it to invite only, otherwise anyone could hijack your protected rooms!"
        )
      );
    }
  }

  /**
   * Take an arbitrary string and a set of room IDs, and return a
   * TextualMessageEventContent whose plaintext component replaces those room
   * IDs with their canonical aliases, and whose html component replaces those
   * room IDs with their matrix.to room pills.
   *
   * @param client The matrix client on which to query for room aliases
   * @param text An arbitrary string to rewrite with room aliases and pills
   * @param roomIds A set of room IDs to find and replace in `text`
   * @param msgtype The desired message type of the returned TextualMessageEventContent
   * @returns A TextualMessageEventContent with replaced room IDs
   */
  private async replaceRoomIdsWithPills(
    text: string,
    roomIds: Set<string>,
    msgtype: MessageType = "m.text"
  ): Promise<TextualMessageEventContent> {
    const content: TextualMessageEventContent = {
      body: text,
      formatted_body: htmlEscape(text),
      msgtype: msgtype,
      format: "org.matrix.custom.html",
    };

    // Though spec doesn't say so, room ids that have slashes in them are accepted by Synapse and Dendrite unfortunately for us.
    const escapeRegex = (v: string): string => {
      return v.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    };

    const viaServers = [userServerName(this.clientUserID)];
    for (const roomId of roomIds) {
      let alias = roomId;
      try {
        alias = (await this.client.getPublishedAlias(roomId)) || roomId;
      } catch (e) {
        // This is a recursive call, so tell the function not to try and call us
        await this.logMessage(
          LogLevel.WARN,
          "utils",
          `Failed to resolve room alias for ${roomId} - see console for details`,
          null,
          true
        );
        LogService.warn(
          "ManagementRoomOutput",
          "Failed resolving room alias when formatting a message",
          e
        );
      }
      const regexRoomId = new RegExp(escapeRegex(roomId), "g");
      content.body = content.body.replace(regexRoomId, alias);
      if (content.formatted_body) {
        const permalink = Permalinks.forRoom(
          alias as StringRoomAlias,
          alias !== roomId ? [] : viaServers
        );
        content.formatted_body = content.formatted_body.replace(
          regexRoomId,
          `<a href="${permalink}">${htmlEscape(alias)}</a>`
        );
      }
    }

    return content;
  }

  public async logMessage(
    level: LogLevel,
    module: string,
    message: string,
    additionalRoomIds: string[] | string | null = null,
    isRecursive = false
  ): Promise<void> {
    if (level === LogLevel.ERROR) {
      Sentry.captureMessage(`${module}: ${message}`, "error");
    }
    if (!additionalRoomIds) additionalRoomIds = [];
    if (!Array.isArray(additionalRoomIds))
      additionalRoomIds = [additionalRoomIds];

    if (this.config.verboseLogging || LogLevel.INFO.includes(level)) {
      let clientMessage = message;
      if (level === LogLevel.WARN) clientMessage = `⚠ | ${message}`;
      if (level === LogLevel.ERROR) clientMessage = `‼ | ${message}`;

      const client = this.client;
      const roomIds = [this.managementRoomID, ...additionalRoomIds];

      let evContent: TextualMessageEventContent = {
        body: message,
        formatted_body: htmlEscape(message),
        msgtype: "m.notice",
        format: "org.matrix.custom.html",
      };
      if (!isRecursive) {
        evContent = await this.replaceRoomIdsWithPills(
          clientMessage,
          new Set(roomIds),
          "m.notice"
        );
      }

      try {
        await client.sendMessage(this.managementRoomID, evContent);
      } catch (ex) {
        LogService.error(
          "ManagementRoomOutput",
          "Failed to log a message to the management room",
          ex
        );
      }
    }
    if (!this.isSuccessfullySendingMessages) {
      this.maybeWarnAboutPublicManagementRoom();
      this.isSuccessfullySendingMessages = true;
    }
    const logFunction = levelToFn[level.toString()];
    if (logFunction === undefined) {
      throw new TypeError(
        `Unable to find logFunction for log level: ${level.toString()}`
      );
    }
    logFunction(module, message);
  }
}
