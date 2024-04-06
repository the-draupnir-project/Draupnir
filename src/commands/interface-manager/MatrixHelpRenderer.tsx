/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 */

import { BaseFunction, CommandTable, InterfaceCommand } from "./InterfaceCommand";
import { MatrixContext, MatrixInterfaceAdaptor, RendererSignature } from "./MatrixInterfaceAdaptor";
import { ArgumentParseError, ParameterDescription, RestDescription } from "./ParameterParsing";
import { JSXFactory } from "./JSXFactory";
import { DocumentNode } from "./DeadDocument";
import { renderMatrixAndSend } from "./DeadDocumentMatrix";
import { LogService } from "matrix-bot-sdk";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { ActionException, ActionResult, MatrixRoomReference, RoomEvent, StringRoomID, isError } from "matrix-protection-suite";

function requiredArgument(argumentName: string): string {
    return `<${argumentName}>`;
}

function keywordArgument(keyword: string): string {
    // ahh fuck what about defaults for keys?
    return `[--${keyword}]`;
}

// they should be allowed to name the rest argument...
function restArgument(rest: RestDescription): string {
    return `[...${rest.name}]`;
}

export function renderParameterDescription(description: ParameterDescription): DocumentNode {
    return <fragment>
        {description.name} - {description.description ?? 'no description'}<br />
    </fragment>
}

export function renderCommandSummary(command: InterfaceCommand<BaseFunction>): DocumentNode {
    return <details>
        <summary>
            <code>{renderCommandHelp(command)}</code> - {command.summary}
        </summary>
        {command.description
            ? <fragment><b>Description:</b><br />{command.description}<br /></fragment>
            : []
        }
        {command.argumentListParser.descriptions.length > 0
            ? <fragment>
                <b>Parameters:</b><br/>{...command.argumentListParser.descriptions.map(renderParameterDescription)}
            </fragment>
            : []
        }
    </details>
}

export function renderCommandHelp(command: InterfaceCommand<BaseFunction>): string {
    const rest = command.argumentListParser.rest;
    const keywords = command.argumentListParser.keywords;
    return [
        ...command.designator,
        ...command.argumentListParser.descriptions
            .map(d => requiredArgument(d.name)),
        ...rest ? [restArgument(rest)] : [],
        ...Object.keys(keywords.description).map(k => keywordArgument(k)),
    ].join(' ');
}

function renderTableHelp(table: CommandTable): DocumentNode {
    let tableName = table.name;
    if (typeof table.name === 'string') {
        tableName = table.name.charAt(0).toUpperCase() + table.name.slice(1);
    }
    return <root>
        <details>
            <summary><b>{tableName} commands:</b></summary>
            {table.getExportedCommands().map(renderCommandSummary)}
            {table.getImportedTables().map(renderTableHelp)}
        </details>
    </root>
}

export async function renderHelp(client: MatrixSendClient, commandRoomID: StringRoomID, event: any, result: ActionResult<CommandTable>): Promise<void> {
    if (isError(result)) {
        throw new TypeError("This command isn't supposed to fail");
    }
    await renderMatrixAndSend(
        renderTableHelp(result.ok),
        commandRoomID,
        event,
        client
    );
}

export const tickCrossRenderer: RendererSignature<MatrixContext, BaseFunction> =  async function tickCrossRenderer(this: MatrixInterfaceAdaptor<MatrixContext, BaseFunction>, client: MatrixSendClient, commandRoomID: StringRoomID, event: RoomEvent, result: ActionResult<unknown>): Promise<void> {
    const react = async (emote: string) => {
        try {
            await client.unstableApis.addReactionToEvent(commandRoomID, event['event_id'], emote);
        } catch (e) {
            LogService.error("tickCrossRenderer", "Couldn't react to the event", event['event_id'], e);
        }
    }
    if (result.isOkay) {
        await react('✅')
    } else {
        if (result.error instanceof ArgumentParseError) {
            await renderMatrixAndSend(
                renderArgumentParseError(this.interfaceCommand, result.error),
                commandRoomID,
                event,
                client);
        } else if (result.error instanceof ActionException) {
            const commandError = result.error;
            LogService.error("CommandException", commandError.uuid, commandError.message, commandError.exception);
            await renderMatrixAndSend(
                renderCommandException(this.interfaceCommand, result.error),
                commandRoomID,
                event,
                client);
        } else {
            await client.replyNotice(commandRoomID, event, result.error.message);
        }
        // reacting is way less important than communicating what happened, do it last.
        await react('❌');
    }
}

// Maybe we need something like the MatrixInterfaceAdaptor but for Error types?

function formattedArgumentHint(command: InterfaceCommand<BaseFunction>, error: ArgumentParseError): string {
    const argumentsUpToError = error.stream.source.slice(0, error.stream.getPosition());
    let commandContext = 'Command context:';
    for (const designator of command.designator) {
        commandContext += ` ${designator}`;
    }
    for (const argument of argumentsUpToError) {
        commandContext += ` ${JSON.stringify(argument)}`;
    }
    let badArgument = ` ${error.stream.peekItem()}\n${Array(commandContext.length + 1).join(' ')} ^ expected ${error.parameter.acceptor.name} here`;
    return commandContext + badArgument;
}

function renderArgumentParseError(command: InterfaceCommand<BaseFunction>, error: ArgumentParseError): DocumentNode {
    return <root>
        There was a problem when parsing the <code>{error.parameter.name}</code> parameter for this command.<br />
        {renderCommandHelp(command)}<br />
        {error.message}<br />
        <pre>{formattedArgumentHint(command, error)}</pre>
    </root>
}

function renderCommandException(command: InterfaceCommand<BaseFunction>, error: ActionException): DocumentNode {
    return <root>
        There was an unexpected error when processing this command:<br />
        {error.message}<br />
        Details can be found by providing the reference <code>{error.uuid}</code>
        to an administrator.
    </root>
}

export function renderMentionPill(mxid: string, displayName: string): DocumentNode {
    const url = `https://matrix.to/#/${mxid}`;
    return <a href={url}>{displayName}</a>
}

export function renderRoomPill(room: MatrixRoomReference): DocumentNode {
    return <a href={room.toPermalink()}>{room.toRoomIDOrAlias()}</a>
}
