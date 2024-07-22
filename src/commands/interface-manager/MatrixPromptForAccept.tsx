/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ClientPlatform, Logger, RoomEvent, StringRoomID, Task, Value, isError } from "matrix-protection-suite";
import { renderMatrixAndSend } from "./DeadDocumentMatrix";
import { CommandTable, InterfaceCommand } from "./InterfaceCommand";
import { DeadDocumentJSX } from "./JSXFactory";
import { MatrixContext, findMatrixInterfaceAdaptor } from "./MatrixInterfaceAdaptor";
import { ArgumentStream, ParameterDescription } from "./ParameterParsing";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { MatrixReactionHandler, ReactionListener } from "./MatrixReactionHandler";
import { StaticDecode, Type } from "@sinclair/typebox";
import { ReadItem, readCommand } from "./CommandReader";
import { printReadably } from "./PrintReadably";
import { DeadDocumentPresentationMirror } from "./DeadDocumentPresentation";

const log = new Logger('MatrixPromptForAccept');

type PromptContext = StaticDecode<typeof PromptContext>;
// FIXME: Remove no-redeclare entirely, it is wrong.

const PromptContext = Type.Object({
    command_designator: Type.Array(Type.String()),
    read_items: Type.Array(Type.String()),
});

type DefaultPromptContext = StaticDecode<typeof DefaultPromptContext>;
// FIXME: Remove no-redeclare entirely, it is wrong.

const DefaultPromptContext = Type.Composite([
    PromptContext,
    Type.Object({
        default: Type.String(),
    })
]);

function continueCommandAcceptingPrompt<CommandContext extends MatrixContext = MatrixContext>(
    promptContext: PromptContext,
    serializedPrompt: string,
    commandTable: CommandTable,
    client: MatrixSendClient,
    clientPlatform: ClientPlatform,
    commandRoomID: StringRoomID,
    reactionHandler: MatrixReactionHandler,
    annotatedEvent: RoomEvent,
    additionalCommandContext: Omit<CommandContext, keyof MatrixContext>): void {
    // TODO: We do this because we don't have a way to deserialize the individual serialized
    // read items. Well we probably should.
    const itemStream = new ArgumentStream(readCommand([
        ...promptContext.command_designator,
        ...promptContext.read_items,
        serializedPrompt
    ].join(' ')));
    const command = commandTable.findAMatchingCommand(itemStream);
    if (command === undefined) {
        log.error(`couldn't find the associated command for a default prompt`, promptContext.command_designator);
        return;
    }
    const adaptor = findMatrixInterfaceAdaptor(command);
    const commandContext = {
        roomID: commandRoomID,
        client,
        clientPlatform,
        reactionHandler: reactionHandler,
        event: annotatedEvent,
        ...additionalCommandContext,
    };
    void Task((async () => { await adaptor.invoke(commandContext, commandContext, ...itemStream.rest()); })());
}

export const DEFAUILT_ARGUMENT_PROMPT_LISTENER = 'ge.applied-langua.ge.draupnir.default_argument_prompt';
export function makeListenerForPromptDefault<CommandContext extends MatrixContext = MatrixContext>(
    client: MatrixSendClient,
    clientPlatform: ClientPlatform,
    commandRoomID: StringRoomID,
    reactionHandler: MatrixReactionHandler,
    commandTable: CommandTable,
    additionalCommandContext: Omit<CommandContext, keyof MatrixContext>
): ReactionListener {
    return function(reactionKey, item, context, reactionMap, annotatedEvent) {
        if (item !== 'ok') {
            return;
        }
        const promptContext = Value.Decode(DefaultPromptContext, context);
        if (isError(promptContext)) {
            log.error(`malformed event context when trying to accept a default prompt`, context);
            return;
        }
        continueCommandAcceptingPrompt(
            promptContext.ok,
            promptContext.ok.default,
            commandTable,
            client,
            clientPlatform,
            commandRoomID,
            reactionHandler,
            annotatedEvent,
            additionalCommandContext
        );
    }
}

export const ARGUMENT_PROMPT_LISTENER = 'ge.applied-langua.ge.draupnir.argument_prompt';
export function makeListenerForArgumentPrompt<CommandContext extends MatrixContext = MatrixContext>(
    client: MatrixSendClient,
    clientPlatform: ClientPlatform,
    commandRoomID: StringRoomID,
    reactionHandler: MatrixReactionHandler,
    commandTable: CommandTable,
    additionalCommandContext: Omit<CommandContext, keyof MatrixContext>
): ReactionListener {
    return function(reactionKey, item, context, reactionMap, annotatedEvent) {
        const promptContext = Value.Decode(PromptContext, context);
        if (isError(promptContext)) {
            log.error(`malformed event context when trying to accept a prompted argument`, context);
            return;
        }
        continueCommandAcceptingPrompt(
            promptContext.ok,
            item,
            commandTable,
            client,
            clientPlatform,
            commandRoomID,
            reactionHandler,
            annotatedEvent,
            additionalCommandContext
        );
    }
}

export async function promptDefault<PresentationType extends ReadItem>(
    this: MatrixContext,
    parameter: ParameterDescription,
    command: InterfaceCommand,
    defaultPrompt: PresentationType,
    existingArguments: ReadItem[]
): Promise<void> {
    const reactionMap = new Map(Object.entries({
        'Ok': 'ok'
    }));
    const events = await renderMatrixAndSend(
        <root>
            No argument was provided for the parameter {parameter.name}, would you like to accept the default?<br/>
            {DeadDocumentPresentationMirror.present(defaultPrompt)}
        </root>,
        this.roomID, this.event, this.client,
        this.reactionHandler.createAnnotation(
            DEFAUILT_ARGUMENT_PROMPT_LISTENER,
            reactionMap,
            {
                command_designator: command.designator,
                read_items: existingArguments.map(printReadably),
                default: printReadably(defaultPrompt)
            }
        )
    );
    if (events[0] === undefined) {
        throw new TypeError(`We should have got at least one event, the one that we just sent`);
    }
    await this.reactionHandler.addReactionsToEvent(
        this.client,
        this.roomID,
        events[0],
        reactionMap
    );
}

// FIXME: <ol> raw tags will not work if the message is sent across events.
// If there isn't a start attribute for `ol` then we'll need to take this into our own hands.
export async function promptSuggestions(
    this: MatrixContext,
    parameter: ParameterDescription,
    command: InterfaceCommand,
    suggestions: ReadItem[],
    existingArguments: ReadItem[],
): Promise<void> {
    const reactionMap = MatrixReactionHandler.createItemizedReactionMap(
        suggestions.map(printReadably)
    );
    const events = await renderMatrixAndSend(
        <root>Please select one of the following options to provide as an argument for the parameter <code>{parameter.name}</code>:
            <ol>
                {suggestions.map((suggestion) => {
                    return <li>
                        {DeadDocumentPresentationMirror.present(suggestion)}
                    </li>
                })}
            </ol>
        </root>,
        this.roomID, this.event, this.client,
        this.reactionHandler.createAnnotation(
            ARGUMENT_PROMPT_LISTENER,
            reactionMap,
            {
                read_items: existingArguments.map(printReadably),
                command_designator: command.designator
            }
        )
    );
    if (events[0] === undefined) {
        throw new TypeError(`We should have got at least one event, the one that we just sent`);
    }
    await this.reactionHandler.addReactionsToEvent(
        this.client,
        this.roomID,
        events[0],
        reactionMap
    );
}
