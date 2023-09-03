import { Mjolnir } from "../Mjolnir";
import { LogLevel, LogService } from "matrix-bot-sdk";
import { defineInterfaceCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, parameters } from "./interface-manager/ParameterParsing";
import { MjolnirContext } from "./CommandHandler";
import { CommandResult } from "./interface-manager/Validation";


defineInterfaceCommand({
    table: "mjolnir",
    designator: ["displayname"],
    summary: "Sets the displayname of the draupnir instance to the specified value in all rooms.",
    parameters: parameters([
        {
            name: 'displayname',
            acceptor: findPresentationType("string"),
            description: 'The displayname to set.'
        }
    ]),
    command: execSetDisplayNameCommand
})

// !draupnir displayname <displayname>
export async function execSetDisplayNameCommand(this: MjolnirContext, _keywords, displayname: string): Promise<CommandResult<any>> {
    let targetRooms = this.mjolnir.protectedRoomsTracker.getProtectedRooms();

    for (const targetRoomId of targetRooms) {
        try {
            await this.client.setDisplayName(displayname);
        } catch (e) {
            const message = e.message || (e.body ? e.body.error : '<no message>');
            LogService.error("SetDisplayNameCommand", e);
            await this.mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, "SetDisplayNameCommand", `Failed to set displayname to ${displayname} in ${targetRoomId}: ${message}`, targetRoomId);
        }
    }

    return CommandResult.Ok(undefined);
}
