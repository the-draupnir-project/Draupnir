import { strict as assert } from "assert";

import { newTestUser } from "../clientHelper";
import { DraupnirTestContext, draupnirClient } from "../mjolnirSetupUtils";
import { MatrixClient } from "matrix-bot-sdk";

describe("Test: shutdown command", function() {
    let client: MatrixClient;
    this.beforeEach(async function () {
        client = await newTestUser(this.config.homeserverUrl, { name: { contains: "shutdown-command" }});
        await client.start();
    })
    this.afterEach(async function () {
        client.stop();
    })
    it("Mjolnir asks synapse to shut down a channel", async function(this: DraupnirTestContext) {
        this.timeout(20000);
        const badRoom = await client.createRoom();
        const draupnir = this.draupnir!;
        await client.joinRoom(draupnir.managementRoomID);

        let reply1 = new Promise(async (resolve) => {
            const msgid = await client.sendMessage(draupnir.managementRoomID, {msgtype: "m.text", body: `!draupnir shutdown room ${badRoom} closure test`});
            client.on('room.event', (roomId, event) => {
                if (
                    roomId === draupnir.managementRoomID
                    && event?.type === "m.reaction"
                    && event.sender === draupnir.clientUserID
                    && event.content?.["m.relates_to"]?.event_id === msgid
                ) {
                    resolve(event);
                }
            });
        });

        const reply2 = new Promise((resolve) => {
            draupnirClient()!.on('room.event', (roomId, event) => {
                if (
                    roomId !== draupnir.managementRoomID
                    && roomId !== badRoom
                    && event?.type === "m.room.message"
                    && event.sender === draupnir.clientUserID
                    && event.content?.body === "closure test"
                ) {
                    resolve(event);
                }
            });
        });

        await reply1
        await reply2

        await assert.rejects(client.joinRoom(badRoom), (e: any) => {
            assert.equal(e.statusCode, 403);
            assert.equal(e.body.error, "This room has been blocked on this server");
            return true;
        });
    } as unknown as Mocha.AsyncFunc);
});
