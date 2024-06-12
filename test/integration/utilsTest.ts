import { strict as assert } from "assert";
import { LogLevel } from "matrix-bot-sdk";
import { DraupnirTestContext, draupnirClient } from "./mjolnirSetupUtils";
import { StringRoomAlias } from "matrix-protection-suite";

describe("Test: utils", function() {
    it("replaceRoomIdsWithPills correctly turns a room ID in to a pill", async function(this: DraupnirTestContext) {
        const managementRoomAlias = this.config.managementRoom as StringRoomAlias;
        const draupnir = this.draupnir!;
        const managementRoomOutput = draupnir.managementRoomOutput;
        await draupnir.client.sendStateEvent(
            draupnir.managementRoomID,
            "m.room.canonical_alias",
            "",
            { alias: managementRoomAlias }
        );

        const message: any = await new Promise(async resolve => {
            draupnirClient()!.on('room.message', (roomId, event) => {
                if (roomId === draupnir.managementRoomID) {
                    if (event.content?.body?.startsWith("it's")) {
                        resolve(event);
                    }
                }
            })
            await managementRoomOutput.logMessage(LogLevel.INFO, 'replaceRoomIdsWithPills test',
                `it's fun here in ${draupnir.managementRoomID}`,
                [draupnir.managementRoomID, "!myfaketestid:example.com"]);
        });
        assert.equal(
            message.content.formatted_body,
            `it's fun here in <a href="https://matrix.to/#/${encodeURIComponent(managementRoomAlias)}">${managementRoomAlias}</a>`
        );
    } as unknown as Mocha.AsyncFunc);
});
