import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { ParsedKeywords, RestDescription, findPresentationType, parameters } from "./interface-manager/ParameterParsing";
import { MjolnirContext } from "./CommandHandler";
import { CommandError, CommandResult } from "./interface-manager/Validation";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";


defineInterfaceCommand({
    table: "mjolnir",
    designator: ["displayname"],
    summary: "Sets the displayname of the draupnir instance to the specified value in all rooms.",
    parameters: parameters(
        [],
        new RestDescription<MjolnirContext>(
            "displayname",
            findPresentationType("string"),
        ),
    ),
    command: execSetDisplayNameCommand
})

// !draupnir displayname <displayname>
export async function execSetDisplayNameCommand(this: MjolnirContext, _keywords: ParsedKeywords, displaynameParts: string[]): Promise<CommandResult<any>> {
    const displayname = displaynameParts.join(' ');
    try {
        await this.client.setDisplayName(displayname);
    } catch (e) {
        const message = e.message || (e.body ? e.body.error : '<no message>');
        return CommandError.Result(`Failed to set displayname to ${displayname}: ${message}`)
    }

    return CommandResult.Ok(undefined);
}

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "displayname"),
    renderer: tickCrossRenderer
})
