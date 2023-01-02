/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 */

import { MatrixSendClient } from "../../MatrixEmitter";
import { htmlEscape } from "../../utils";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { MatrixContext, MatrixInterfaceAdaptor } from "./MatrixInterfaceAdaptor";
import { ArgumentParseError, KeywordParser } from "./ParamaterParsing";
import { CommandError, CommandResult } from "./Validation";

function requiredArgument(argumentName: string): string {
    return `<${argumentName}>`;
}

function keywordArgument(keyword: string): string {
    // ahh fuck what about defaults for keys?
    return `[--${keyword}]`;
}

// they should be allowed to name the rest argument...
function restArgument(): string {
    return `[...rest]`;
}

function renderCommandHelp(command: InterfaceCommand<BaseFunction>): string {
    let text = '';
    for (const designator of command.designator) {
        text += `${designator} `
    }
    for (const description of command.argumentListParser.descriptions) {
        text += `${requiredArgument(description.name)} `;
    }
    const restParser = command.argumentListParser.restParser;
    if (restParser !== undefined) {
        // not too happy with how keywords are represented here., like there's just the keys with no context smh.
        if (restParser instanceof KeywordParser) {
            for (const keyword of Object.keys(restParser.description)) {
                if (keyword === "allowOtherKeys") {
                    continue;
                }
                // ahh fuck what about defaults for keys?
                text += `${keywordArgument(keyword)} `;
            }
            if (restParser.description.allowOtherKeys) {
                text += `${restArgument()} `;
            }
        } else {
            text += `${restArgument()} `;
        }
    }
    return text;
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
            await client.replyNotice(commandRoomId, event, result.err.message, renderArgumentParseError(this.interfaceCommand, result.err));
        } else {
            await client.replyNotice(commandRoomId, event, result.err.message);
        }
    }
}

// Maybe we need something like the MatrixInterfaceAdaptor but for Error types?
function renderArgumentParseError(command: InterfaceCommand<BaseFunction>, error: ArgumentParseError): string {
    let html = '';
    html += `There was a problem when parsing the "${error.paramater.name}" paramater for this command.<br>`
    html += htmlEscape(renderCommandHelp(command));
    html += '<br>';
    html += error.message + '<br>';
    html += '<code>';
    // everything in the command excluding the current argument.
    const argumentsUpToError = error.stream.source.slice(0, error.stream.getPosition());
    let commandContext = 'Command context:';
    for (const designator of command.designator) {
        commandContext += ` ${designator}`;
    }
    for (const argument of argumentsUpToError) {
        commandContext += ` ${JSON.stringify(argument)}`;
    }
    html += commandContext;
    html += ` ${error.stream.peekItem()}\n${Array(commandContext.length + 1).join(' ')} ^ expected ${error.paramater.acceptor.name} here`;
    html += '</code>';
    return html;
}