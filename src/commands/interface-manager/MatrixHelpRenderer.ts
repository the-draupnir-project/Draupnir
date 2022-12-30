/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 */

import { MatrixSendClient } from "../../MatrixEmitter";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { KeywordParser } from "./ParamaterParsing";
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
