// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import {
  StringEventID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  ClientPlatform,
  Logger,
  Ok,
  RoomEvent,
  RoomMessageSender,
  isError,
} from "matrix-protection-suite";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { MatrixReactionHandler } from "./MatrixReactionHandler";
import {
  BasicInvocationInformation,
  CommandDispatcherCallbacks,
  DocumentNode,
  InvocationInformationFromEventContext,
  MatrixInterfaceAdaptorCallbacks,
  MatrixInterfaceEventsFromDeadDocument,
  MatrixInterfaceRendererFailedCB,
  StandardAdaptorContextToCommandContextTranslator,
  StandardMatrixInterfaceAdaptor,
  TextPresentationRenderer,
  renderMatrix,
} from "@the-draupnir-project/interface-manager";
import { matrixCommandRenderer } from "./MatrixHelpRenderer";
import { promptDefault, promptSuggestions } from "./MatrixPromptForAccept";
import { Result } from "@gnuxie/typescript-result";

export interface MatrixEventContext {
  roomID: StringRoomID;
  event: RoomEvent;
}

export type MatrixAdaptorContext = {
  readonly client: MatrixSendClient;
  readonly clientPlatform: ClientPlatform;
  readonly clientUserID: StringUserID;
  readonly reactionHandler: MatrixReactionHandler;
  readonly commandRoomID: StringRoomID;
};

export async function sendMatrixEventsFromDeadDocument(
  messageSender: RoomMessageSender,
  roomID: StringRoomID,
  document: DocumentNode,
  {
    replyToEvent,
    additionalContent = {},
  }: {
    replyToEvent?: undefined | RoomEvent;
    additionalContent?: Record<string, unknown>;
  }
): Promise<ActionResult<StringEventID[]>> {
  const baseContent = (text: string, html: string) => {
    return {
      msgtype: "m.notice",
      body: text,
      format: "org.matrix.custom.html",
      formatted_body: html,
    };
  };
  const renderInitialReply = async (
    text: string,
    html: string
  ): Promise<ActionResult<StringEventID>> => {
    return await messageSender.sendMessage(roomID, {
      ...baseContent(text, html),
      ...additionalContent,
      ...(replyToEvent === undefined
        ? {} // if they don't supply a reply just send a top level event.
        : {
            "m.relates_to": {
              "m.in_reply_to": {
                event_id: replyToEvent["event_id"],
              },
            },
          }),
    });
  };
  const renderThreadReply = async (
    eventId: string,
    text: string,
    html: string
  ) => {
    return await messageSender.sendMessage(roomID, {
      ...baseContent(text, html),
      "m.relates_to": {
        rel_type: "m.thread",
        event_id: eventId,
      },
    });
  };
  let initialReplyEventID: StringEventID | undefined = undefined;
  return await renderMatrix(
    document,
    async (
      text: string,
      html: string
    ): Promise<ActionResult<StringEventID>> => {
      if (initialReplyEventID === undefined) {
        const replyResult = await renderInitialReply(text, html);
        if (isError(replyResult)) {
          return replyResult;
        } else {
          initialReplyEventID = replyResult.ok;
          return replyResult;
        }
      } else {
        return await renderThreadReply(initialReplyEventID, text, html);
      }
    }
  );
}

export const matrixEventsFromDeadDocument: MatrixInterfaceEventsFromDeadDocument<
  MatrixAdaptorContext,
  MatrixEventContext
> = async function matrixEventsFromDeadDocument(
  { clientPlatform },
  { event },
  document
) {
  const sendResult = await sendMatrixEventsFromDeadDocument(
    clientPlatform.toRoomMessageSender(),
    event.room_id,
    document,
    { replyToEvent: event }
  );
  if (isError(sendResult)) {
    return sendResult as Result<void>;
  } else {
    return Ok(undefined);
  }
};

const log = new Logger("MPSInterfaceAdaptor");

export const MPSCommandDispatcherCallbacks = {
  commandFailedCB(_info, command, error) {
    log.error(
      `The command "${command.designator.join(" ")}" returned with an error:`,
      error
    );
  },
  commandUncaughtErrorCB(info, body, error) {
    log.error(
      `Caught an unexpcted error when attempting to process the command "${body}" send by the user ${info.commandSender}:`,
      error
    );
  },
  logCurrentCommandCB(info, commandParts) {
    log.info(
      `Command being processed for ${info.commandSender}:`,
      ...commandParts.map(
        TextPresentationRenderer.render.bind(TextPresentationRenderer)
      )
    );
  },
  convertUncaughtErrorToResultError(error) {
    return new ActionException(
      ActionExceptionKind.Unknown,
      error,
      error.message
    );
  },
} satisfies CommandDispatcherCallbacks<BasicInvocationInformation>;

export const rendererFailedCB: MatrixInterfaceRendererFailedCB<
  MatrixAdaptorContext,
  MatrixEventContext
> = function (_adaptor, _eventContext, command, rendererError) {
  log.error(
    `A renderer for the command "${command.designator.join(" ")}" returned with an error:`,
    rendererError
  );
};

export const MPSMatrixInterfaceAdaptorCallbacks = Object.freeze({
  promptDefault,
  promptSuggestions,
  defaultRenderer: matrixCommandRenderer,
  matrixEventsFromDeadDocument,
  rendererFailedCB,
}) satisfies MatrixInterfaceAdaptorCallbacks<
  MatrixAdaptorContext,
  MatrixEventContext
>;

export const invocationInformationFromMatrixEventcontext: InvocationInformationFromEventContext<MatrixEventContext> =
  function (eventContext) {
    return {
      commandEventID: eventContext.event.event_id,
      commandSender: eventContext.event.sender,
    };
  };

export const MPSContextToCommandContextTranslator =
  new StandardAdaptorContextToCommandContextTranslator<MatrixAdaptorContext>();

export const MPSMatrixInterfaceAdaptor = new StandardMatrixInterfaceAdaptor<
  MatrixAdaptorContext,
  MatrixEventContext
>(
  MPSContextToCommandContextTranslator,
  invocationInformationFromMatrixEventcontext,
  MPSMatrixInterfaceAdaptorCallbacks,
  MPSCommandDispatcherCallbacks
);
