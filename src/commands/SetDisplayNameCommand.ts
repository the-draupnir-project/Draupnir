import { Mjolnir } from "../Mjolnir";
import { LogLevel, LogService } from "matrix-bot-sdk";

// !draupnir displayname <displayname>
export async function execSetDisplayNameCommand(roomId: string, event: any, mjolnir: Mjolnir, parts: string[]) {
    const displayname = parts[2];

    let targetRooms = mjolnir.protectedRoomsTracker.getProtectedRooms();

    for (const targetRoomId of targetRooms) {
        try {
            await mjolnir.client.setDisplayName(displayname);
        } catch (e) {
            const message = e.message || (e.body ? e.body.error : '<no message>');
            LogService.error("SetDisplayNameCommand", e);
            await mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, "SetDisplayNameCommand", `Failed to set displayname to ${displayname} in ${targetRoomId}: ${message}`, targetRoomId);
        }
    }

    await mjolnir.client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
}
