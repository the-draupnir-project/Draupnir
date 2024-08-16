// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { LogService, RichReply } from "matrix-bot-sdk";
import { readCommand } from "./interface-manager/CommandReader";
import {
  CommandTable,
  defineCommandTable,
  findCommandTable,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  findMatrixInterfaceAdaptor,
  MatrixContext,
} from "./interface-manager/MatrixInterfaceAdaptor";
import { ArgumentStream } from "./interface-manager/ParameterParsing";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import "./interface-manager/MatrixPresentations";
import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  ResultError,
  RoomMessage,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";

export interface DraupnirContext extends MatrixContext {
  draupnir: Draupnir;
}

export type DraupnirBaseExecutor<Args extends unknown[] = unknown[]> = (
  this: DraupnirContext,
  ...args: Args
) => Promise<ActionResult<unknown>>;

// Plesae keep these in alphabetical order.
defineCommandTable("synapse admin");
import "./AliasCommands";
import "./DeactivateCommand";
import "./HijackRoomCommand";
import "./ShutdownRoomCommand";

defineCommandTable("draupnir").importTable(findCommandTable("synapse admin"));
import "./Ban";
import "./CreateBanListCommand";
import "./Help";
import "./ImportCommand";
import "./KickCommand";
import "./PermissionCheckCommand";
import "./ProtectionsCommands";
import "./RedactCommand";
import "./ResolveAlias";
import "./Rooms";
import "./Rules";
import "./SetDisplayNameCommand";
import "./SetPowerLevelCommand";
import "./StatusCommand";
import "./Unban";
import "./WatchUnwatchCommand";

export const COMMAND_PREFIX = "!draupnir";

export async function handleCommand(
  roomID: StringRoomID,
  event: RoomMessage,
  normalisedCommand: string,
  draupnir: Draupnir,
  commandTable: CommandTable
): Promise<void> {
  try {
    const readItemsIncludingPrefix = readCommand(normalisedCommand);
    const readItems = readItemsIncludingPrefix.slice(1);
    const stream = new ArgumentStream(readItems);
    const command =
      commandTable.findAMatchingCommand(stream) ??
      findTableCommand("draupnir", "help");
    const adaptor = findMatrixInterfaceAdaptor(command);
    const draupnirContext: DraupnirContext = {
      ...draupnir.commandContext,
      event,
    };
    try {
      await adaptor.invoke(draupnirContext, draupnirContext, ...stream.rest());
    } catch (e) {
      const commandError = new ActionException(
        ActionExceptionKind.Unknown,
        e,
        "Unknown Unexpected Error"
      );
      await tickCrossRenderer.call(
        draupnirContext,
        draupnir.client,
        roomID,
        event,
        ResultError(commandError)
      );
    }
  } catch (e) {
    LogService.error("CommandHandler", e);
    const text =
      "There was an error processing your command - see console/log for details";
    const reply = RichReply.createFor(roomID, event, text, text);
    reply["msgtype"] = "m.notice";
    await draupnir.client.sendMessage(roomID, reply);
  }
}

export function extractCommandFromMessageBody(
  body: string,
  {
    prefix,
    localpart,
    userId,
    additionalPrefixes,
    allowNoPrefix,
  }: {
    prefix: string;
    localpart: string;
    userId: string;
    additionalPrefixes: string[];
    allowNoPrefix: boolean;
  }
): string | undefined {
  const plainPrefixes = [prefix, localpart, userId, ...additionalPrefixes];
  const allPossiblePrefixes = [
    ...plainPrefixes.map((p) => `!${p}`),
    ...plainPrefixes.map((p) => `${p}:`),
    ...plainPrefixes,
    ...(allowNoPrefix ? ["!"] : []),
  ];
  const usedPrefixInMessage = allPossiblePrefixes.find((p) =>
    body.toLowerCase().startsWith(p.toLowerCase())
  );
  if (usedPrefixInMessage === undefined) {
    return;
  }
  // normalise the event body to make the prefix uniform (in case the bot has spaces in its display name)
  const restOfBody = body.substring(usedPrefixInMessage.length);
  return prefix + (restOfBody.startsWith(" ") ? restOfBody : ` ${restOfBody}`);
}
