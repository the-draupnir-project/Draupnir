import { MatrixClient } from "matrix-bot-sdk";
import { newTestUser, noticeListener } from "./clientHelper"
import { DraupnirTestContext } from "./mjolnirSetupUtils";

describe("Test: !help command", function() {
    let client: MatrixClient;
    this.beforeEach(async function (this: DraupnirTestContext) {
        client = await newTestUser(this.config.homeserverUrl, { name: { contains: "-" }});;
        await client.start();
    } as any)
    this.afterEach(async function () {
        client?.stop();
    } as any)
    it('Mjolnir responded to !mjolnir help', async function(this: DraupnirTestContext) {
        this.timeout(30000);
        // send a messgage
        await client.joinRoom(this.draupnir!.managementRoomID);
        // listener for getting the event reply
        let reply = new Promise((resolve, reject) => {
            client.on('room.message', noticeListener(this.draupnir!.managementRoomID, (event) => {
                if (event.content.body.includes("which can be used")) {
                    resolve(event);
                }
            }))
        });
        await client.sendMessage(this.draupnir!.managementRoomID, {msgtype: "m.text", body: "!draupnir help"})
        await reply
    } as unknown as Mocha.AsyncFunc)
})
