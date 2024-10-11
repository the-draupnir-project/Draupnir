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
  MatrixInterfaceAdaptorCallbacks,
  MatrixInterfaceCommandDispatcher,
  TextPresentationRenderer,
} from "@the-draupnir-project/interface-manager";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";
import { Logger, Task, Value } from "matrix-protection-suite";
import {
  MatrixReactionHandler,
  ReactionListener,
} from "./MatrixReactionHandler";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  CommandPromptContext,
  continueCommandAcceptingPrompt,
} from "./MatrixPromptForAccept";

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

export const matrixEventsFromConfirmationPrompt = async function (
  { client, clientPlatform, reactionHandler },
  { event },
  command,
  document
) {
  const reactionMap = new Map<string, string>(
    Object.entries({ OK: "OK", Cancel: "Cancel" })
  );
  const sendResult = await sendMatrixEventsFromDeadDocument(
    clientPlatform.toRoomMessageSender(),
    event.room_id,
    document,
    {
      replyToEvent: event,
      additionalContent: reactionHandler.createAnnotation(
        COMMAND_CONFIRMATION_LISTENER,
        reactionMap,
        {
          command_designator: command.designator,
          read_items: command
            .toPartialCommand()
            .stream.source.slice(command.designator.length)
            .map((p) => TextPresentationRenderer.render(p)),
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
    .addReactionsToEvent(client, event.room_id, sendResult.ok[0], reactionMap)
    .then((_) => Ok(undefined), resultifyBotSDKRequestError);
} satisfies MatrixInterfaceAdaptorCallbacks<
  MatrixAdaptorContext,
  MatrixEventContext
>["matrixEventsFromConfirmationPrompt"];
