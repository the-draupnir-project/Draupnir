import { strict as assert } from "assert";

import { newTestUser } from "../clientHelper";
import { getFirstReply } from "./commandUtils";

describe("Test: The queryAdmin command", function () {
    // If a test has a timeout while awaitng on a promise then we never get given control back.
    afterEach(function () { this.moderator?.stop(); });

    it('Mjölnir can query and display the query results for a complete json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        const reply_event = await getFirstReply(this.mjolnir.matrixEmitter, this.mjolnir.managementRoomId, async () => {
            return await moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text', body: `!mjolnir queryAdmin http://localhost:8081` });
        });
        assert.equal(reply_event.content.body, "**Support info for (http://localhost:8081):**\nSupport Page: http://localhost\n\n\n * **admin** - [@admin:localhost](https://matrix.to/#/@admin:localhost)\n", `Draupnir did not parse the json as expected.`);
    })

    it('Mjölnir can query and display the query results for a partial contacts-only json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        const reply_event = await getFirstReply(this.mjolnir.matrixEmitter, this.mjolnir.managementRoomId, async () => {
            return await moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text', body: `!mjolnir queryAdmin http://localhost:7072` });
        });
        assert.equal(reply_event.content.body, "**Support infos for (http://localhost:7072):**\n * **admin** - [@admin:localhost](https://matrix.to/#/@admin:localhost)\n", `Draupnir did not parse the json as expected.`);
    })

    it('Mjölnir can query and display the query results for a partial support_page-only json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        const reply_event = await getFirstReply(this.mjolnir.matrixEmitter, this.mjolnir.managementRoomId, async () => {
            return await moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text', body: `!mjolnir queryAdmin http://localhost:7071` });
        });
        assert.equal(reply_event.content.body, "**Support Page for (http://localhost:7071):**\nSupport Page: http://localhost\n", `Draupnir did not parse the json as expected.`);
    })

    it('Mjölnir can query and display an error for a non well-formed json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        const reply_event = await getFirstReply(this.mjolnir.matrixEmitter, this.mjolnir.managementRoomId, async () => {
            return await moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text', body: `!mjolnir queryAdmin http://localhost:7070` });
        });
        assert.equal(reply_event.content.body, "> <@mjolnir-test-user-moderator61610:localhost:9999> !mjolnir queryAdmin http://localhost:7070\nThe request failed with an error: Error: Error during MatrixClient request GET /.well-known/matrix/support: 404 Not Found -- {}.", `Draupnir did not parse the json as expected.`);
    })
});
