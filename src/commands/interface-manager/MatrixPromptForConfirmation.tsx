// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import {
  MatrixAdaptorContext,
  MatrixEventContext,
  sendMatrixEventsFromDeadDocument,
} from "./MPSMatrixInterfaceAdaptor";
import {
  DocumentNode,
  MatrixInterfaceAdaptorCallbacks,
  MatrixInterfaceCommandDispatcher,
  TextPresentationRenderer,
} from "@the-draupnir-project/interface-manager";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";
import { Logger, RoomEvent, Task, Value } from "matrix-protection-suite";
import {
  MatrixReactionHandler,
  ReactionListener,
} from "./MatrixReactionHandler";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  CommandPromptContext,
  continueCommandAcceptingPrompt,
} from "./MatrixPromptForAccept";
import { Draupnir } from "../../Draupnir";

const log = new Logger("MatrixPromptForConfirmation");

export const COMMAND_CONFIRMATION_LISTENER =
  "me.marewolf.draupnir.command_confirmation";

export function makeConfirmationPromptListener(
  commandRoomID: StringRoomID,
  commandDispatcher: MatrixInterfaceCommandDispatcher<MatrixEventContext>,
  reactionHandler: MatrixReactionHandler
): ReactionListener {
  return (key, item, rawContext, _reactionMap, annotatedEvent) => {
    if (annotatedEvent.room_id !== commandRoomID) {
      return;
    }
    if (key === "Cancel") {
      void Task(reactionHandler.cancelPrompt(annotatedEvent));
      return;
    }
    if (key !== "OK") {
      return;
    }
    const promptContext = Value.Decode(CommandPromptContext, rawContext);
    if (isError(promptContext)) {
      log.error(
        `malformed event context when trying to accept a prompted argument`,
        context
      );
      return;
    }
    continueCommandAcceptingPrompt(
      { event: annotatedEvent, roomID: annotatedEvent.room_id },
      promptContext.ok,
      "--no-confirm",
      commandDispatcher,
      reactionHandler
    );
  };
}

export type ConfirmationPromptSender = (
  {
    commandDesignator,
    readItems,
  }: { commandDesignator: string[]; readItems: string[] },
  document: DocumentNode,
  {
    roomID,
    event,
  }: { roomID?: StringRoomID | undefined; event?: RoomEvent | undefined }
) => Promise<Result<void>>;

export function makeconfirmationPromptSender(
  draupnir: Draupnir
): ConfirmationPromptSender {
  return async function (
    { commandDesignator, readItems },
    document,
    { roomID, event }
  ) {
    return sendConfirmationPrompt(
      draupnir,
      { commandDesignator, readItems },
      document,
      { roomID, event }
    );
  };
}

/**
 * This utility allows protections to send confirmation prompts that appear like confirmation prompts
 * for commands that have been sent without the `--no-confirm` option, but require confirmation.
 */
export async function sendConfirmationPrompt(
  { client, clientPlatform, reactionHandler }: MatrixAdaptorContext,
  {
    commandDesignator,
    readItems,
  }: { commandDesignator: string[]; readItems: string[] },
  document: DocumentNode,
  {
    roomID,
    event,
  }: { roomID?: StringRoomID | undefined; event?: RoomEvent | undefined }
): Promise<Result<void>> {
  const roomIDToUse = roomID ?? event?.room_id;
  if (roomIDToUse === undefined) {
    throw new TypeError(`You must provide either a room ID or an event`);
  }
  const reactionMap = new Map<string, string>(
    Object.entries({ OK: "OK", Cancel: "Cancel" })
  );
  const sendResult = await sendMatrixEventsFromDeadDocument(
    clientPlatform.toRoomMessageSender(),
    roomIDToUse,
    document,
    {
      replyToEvent: event,
      additionalContent: reactionHandler.createAnnotation(
        COMMAND_CONFIRMATION_LISTENER,
        reactionMap,
        {
          command_designator: commandDesignator,
          read_items: readItems,
        }
      ),
    }
  );
  if (isError(sendResult)) {
    return sendResult as Result<void>;
  }
  if (sendResult.ok[0] === undefined) {
    throw new TypeError(`We exepct to have sent at least one event`);
  }
  return await reactionHandler
    .addReactionsToEvent(client, roomIDToUse, sendResult.ok[0], reactionMap)
    .then((_) => Ok(undefined), resultifyBotSDKRequestError);
}

export const matrixEventsFromConfirmationPrompt = async function (
  adaptorContext,
  { event },
  command,
  document
) {
  return await sendConfirmationPrompt(
    adaptorContext,
    {
      commandDesignator: command.designator,
      readItems: command
        .toPartialCommand()
        .stream.source.slice(command.designator.length)
        .map((p) => TextPresentationRenderer.render(p)),
    },
    document,
    { event }
  );
} satisfies MatrixInterfaceAdaptorCallbacks<
  MatrixAdaptorContext,
  MatrixEventContext
>["matrixEventsFromConfirmationPrompt"];
