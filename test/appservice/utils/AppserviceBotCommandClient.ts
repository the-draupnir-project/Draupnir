import { Span } from "@opentelemetry/api";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { ReadItem } from "../../../src/commands/interface-manager/CommandReader";
import { findCommandTable } from "../../../src/commands/interface-manager/InterfaceCommand";
import { ArgumentStream } from "../../../src/commands/interface-manager/ParameterParsing";
import { CommandResult } from "../../../src/commands/interface-manager/Validation";
import { trace } from "../../../src/utils";

export class AppservideBotCommandClient {
    constructor(private readonly appservice: MjolnirAppService) {

    }

    @trace
    public async sendCommand<CommandReturnType extends CommandResult<any>>(...items: ReadItem[]): Promise<CommandReturnType> {
        // The span is always the last element due to order of args. And since we try to hide it we dont have it in the type and need to go via unknown here.
        const _parentSpan: Span = items.pop() as unknown as Span;
        const stream = new ArgumentStream(items);
        const matchingCommand = findCommandTable("appservice bot").findAMatchingCommand(stream);
        if (!matchingCommand) {
            throw new TypeError(`Couldn't finnd a command from these items ${JSON.stringify(items)}`);
        }
        return await matchingCommand.parseThenInvoke({ appservice: this.appservice }, stream) as CommandReturnType;
    }
}
