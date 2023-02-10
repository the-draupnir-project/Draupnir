/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 */

import { MatrixSendClient } from "../../MatrixEmitter";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { MatrixContext, MatrixInterfaceAdaptor } from "./MatrixInterfaceAdaptor";
import { ArgumentParseError, RestDescription } from "./ParameterParsing";
import { CommandError, CommandResult } from "./Validation";
import { JSXFactory } from "./JSXFactory";
import { DocumentNode } from "./DeadDocument";
import { renderMatrixAndSend } from "./DeadDocumentMatrix";
import { CommandException } from "./CommandException";

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

function renderCommandHelp(command: InterfaceCommand<BaseFunction>): string {
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

// What is really needed is a rendering protocol, that works with bullshit text+html that's really just string building like we're doing here or some other media format
export async function renderHelp(client: MatrixSendClient, commandRoomId: string, event: any, result: CommandResult<InterfaceCommand<BaseFunction>[], CommandError>): Promise<void> {
    const commands = result.ok;
    let text = ''
    for (const command of commands) {
        text += `${renderCommandHelp(command)}\n`;
    }
    await client.replyNotice(commandRoomId, event, text);
}

export async function tickCrossRenderer(this: MatrixInterfaceAdaptor<MatrixContext, BaseFunction>, client: MatrixSendClient, commandRoomId: string, event: any, result: CommandResult<unknown, CommandError>): Promise<void> {
    const react = async (emote: string) => {
        await client.unstableApis.addReactionToEvent(commandRoomId, event['event_id'], emote);
    }
    if (result.isOk()) {
        await react('✅')
    } else {
        await react('❌');
        if (result.err instanceof ArgumentParseError) {
            await renderMatrixAndSend(
                renderArgumentParseError(this.interfaceCommand, result.err),
                commandRoomId,
                event,
                client);
        } else if (result.err instanceof CommandException) {
            await renderMatrixAndSend(
                renderCommandException(this.interfaceCommand, result.err),
                commandRoomId,
                event,
                client);
        } else {
            await client.replyNotice(commandRoomId, event, result.err.message);
        }
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
        There was a problem when parsing the <code>{error.parameter.name}</code> parameter for this command.<br/>
        {renderCommandHelp(command)}<br/>
        {error.message}<br/>
        <pre>{formattedArgumentHint(command, error)}</pre>
    </root>
}

function renderCommandException(command: InterfaceCommand<BaseFunction>, error: CommandException): DocumentNode {
    return <root>
        There was an unexpected error when processing this command:<br/>
        {error.message}<br/>
        Details can be found by providing the reference <code>{error.uuid}</code>
        to an administrator.
    </root>
}