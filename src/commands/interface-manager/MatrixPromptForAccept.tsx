// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Logger, Task, Value, isError } from "matrix-protection-suite";
import {
  MatrixReactionHandler,
  ReactionListener,
} from "./MatrixReactionHandler";
import { StaticDecode, Type } from "@sinclair/typebox";
import {
  MatrixAdaptorContext,
  MatrixEventContext,
  sendMatrixEventsFromDeadDocument,
} from "./MPSMatrixInterfaceAdaptor";
import {
  DeadDocumentJSX,
  MatrixInterfaceCommandDispatcher,
  ParameterDescription,
  PartialCommand,
  Presentation,
  StandardPresentationArgumentStream,
  TextPresentationRenderer,
  readCommand,
} from "@the-draupnir-project/interface-manager";
import { Ok, Result } from "@gnuxie/typescript-result";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";

const log = new Logger("MatrixPromptForAccept");

export type CommandPromptContext = StaticDecode<typeof CommandPromptContext>;

export const CommandPromptContext = Type.Object({
  command_designator: Type.Array(Type.String()),
  read_items: Type.Array(Type.String()),
});

type DefaultPromptContext = StaticDecode<typeof DefaultPromptContext>;

const DefaultPromptContext = Type.Composite([
  CommandPromptContext,
  Type.Object({
    default: Type.String(),
  }),
]);

export function continueCommandAcceptingPrompt(
  eventContext: MatrixEventContext,
  promptContext: CommandPromptContext,
  serializedPrompt: string,
  commandDispatcher: MatrixInterfaceCommandDispatcher<MatrixEventContext>,
  reactionHandler: MatrixReactionHandler
): void {
  const stream = new StandardPresentationArgumentStream(
    readCommand(
      [
        ...promptContext.command_designator,
        ...promptContext.read_items,
        serializedPrompt,
      ].join(" ")
    )
  );
  commandDispatcher.handleCommandFromPresentationStream(eventContext, stream);
  void Task(
    reactionHandler.completePrompt(
      eventContext.roomID,
      eventContext.event.event_id
    )
  );
}

export const DEFAULT_ARGUMENT_PROMPT_LISTENER =
  "ge.applied-langua.ge.draupnir.default_argument_prompt";
export function makeListenerForPromptDefault(
  commandRoomID: StringRoomID,
  commandDispatcher: MatrixInterfaceCommandDispatcher<MatrixEventContext>,
  reactionHandler: MatrixReactionHandler
): ReactionListener {
  return function (reactionKey, item, context, reactionMap, annotatedEvent) {
    if (annotatedEvent.room_id !== commandRoomID) {
      return;
    }
    if (item !== "ok") {
      return;
    }
    const promptContext = Value.Decode(DefaultPromptContext, context);
    if (isError(promptContext)) {
      log.error(
        `malformed event context when trying to accept a default prompt`,
        context
      );
      return;
    }
    continueCommandAcceptingPrompt(
      { event: annotatedEvent, roomID: annotatedEvent.room_id },
      promptContext.ok,
      item,
      commandDispatcher,
      reactionHandler
    );
  };
}

export const ARGUMENT_PROMPT_LISTENER =
  "ge.applied-langua.ge.draupnir.argument_prompt";
export function makeListenerForArgumentPrompt(
  commandRoomID: StringRoomID,
  commandDispatcher: MatrixInterfaceCommandDispatcher<MatrixEventContext>,
  reactionHandler: MatrixReactionHandler
): ReactionListener {
  return function (reactionKey, item, context, reactionMap, annotatedEvent) {
    if (annotatedEvent.room_id !== commandRoomID) {
      return;
    }
    const promptContext = Value.Decode(CommandPromptContext, context);
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
      item,
      commandDispatcher,
      reactionHandler
    );
  };
}

export async function promptDefault<TPresentation extends Presentation>(
  { client, clientPlatform, reactionHandler }: MatrixAdaptorContext,
  eventContext: MatrixEventContext,
  parameter: ParameterDescription,
  command: PartialCommand,
  defaultPrompt: TPresentation,
  existingArguments: Presentation[]
): Promise<Result<void>> {
  const reactionMap = new Map(
    Object.entries({
      Ok: "ok",
    })
  );
  const sendResult = await sendMatrixEventsFromDeadDocument(
    clientPlatform.toRoomMessageSender(),
    eventContext.event.room_id,
    <root>
      No argument was provided for the parameter {parameter.name}, would you
      like to accept the default?
      <br />
      {TextPresentationRenderer.render(defaultPrompt)}
    </root>,
    {
      replyToEvent: eventContext.event,
      additionalContent: reactionHandler.createAnnotation(
        DEFAULT_ARGUMENT_PROMPT_LISTENER,
        reactionMap,
        {
          command_designator: command.designator,
          read_items: existingArguments.map((p) =>
            TextPresentationRenderer.render(p)
          ),
          default: TextPresentationRenderer.render(defaultPrompt),
        }
      ),
    }
  );
  if (isError(sendResult)) {
    return sendResult;
  }
  if (sendResult.ok[0] === undefined) {
    throw new TypeError(`Something is really wrong with the code`);
  }
  await reactionHandler.addReactionsToEvent(
    client,
    eventContext.event.room_id,
    sendResult.ok[0],
    reactionMap
  );
  return Ok(undefined);
}

// FIXME: <ol> raw tags will not work if the message is sent across events.
// If there isn't a start attribute for `ol` then we'll need to take this into our own hands.
export async function promptSuggestions<TPresentation extends Presentation>(
  { client, clientPlatform, reactionHandler }: MatrixAdaptorContext,
  eventContext: MatrixEventContext,
  parameter: ParameterDescription,
  command: PartialCommand,
  suggestions: TPresentation[],
  existingArguments: Presentation[]
): Promise<Result<void>> {
  const reactionMap = MatrixReactionHandler.createItemizedReactionMap(
    suggestions.map((suggestion) => TextPresentationRenderer.render(suggestion))
  );
  const sendResult = await sendMatrixEventsFromDeadDocument(
    clientPlatform.toRoomMessageSender(),
    eventContext.event.room_id,
    <root>
      Please select one of the following options to provide as an argument for
      the parameter <code>{parameter.name}</code>:
      <ol>
        {suggestions.map((suggestion) => {
          return <li>{TextPresentationRenderer.render(suggestion)}</li>;
        })}
      </ol>
    </root>,
    {
      replyToEvent: eventContext.event,
      additionalContent: reactionHandler.createAnnotation(
        ARGUMENT_PROMPT_LISTENER,
        reactionMap,
        {
          command_designator: command.designator,
          read_items: existingArguments.map((p) =>
            TextPresentationRenderer.render(p)
          ),
        }
      ),
    }
  );
  if (isError(sendResult)) {
    return sendResult;
  }
  if (sendResult.ok[0] === undefined) {
    throw new TypeError(`Something is really wrong with the code`);
  }
  await reactionHandler.addReactionsToEvent(
    client,
    eventContext.event.room_id,
    sendResult.ok[0],
    reactionMap
  );
  return Ok(undefined);
}
