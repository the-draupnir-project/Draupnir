import { strict as assert } from "assert";

import { newTestUser } from "../clientHelper";
import { getMessagesByUserIn } from "../../../src/utils";

describe("Test: The queryAdmin command", function () {
    // If a test has a timeout while awaitng on a promise then we never get given control back.
    afterEach(function () { this.moderator?.stop(); });

    it('Mjölnir can query and display the query results for a complete json.', async function () {
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:8081` });


        const draupnir = this.config.RUNTIME.client!
        let draupnirUserId = await draupnir.getUserId();

        // Check if draupnir replied
        await getMessagesByUserIn(moderator, draupnirUserId, this.mjolnir.managementRoomId, 1000, function (events) {
            events.map(e => {
                if (e.type === 'm.room.message') {
                    assert.equal(e.content.body, "", `Draupnir did not parse the json as expected: ${e.content.body}.`)
                }
            })
        });
    })

    it('Mjölnir can query and display the query results for a partial contacts-only json.', async function () {
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:7072` });


        const draupnir = this.config.RUNTIME.client!
        let draupnirUserId = await draupnir.getUserId();

        // Check if draupnir replied
        await getMessagesByUserIn(moderator, draupnirUserId, this.mjolnir.managementRoomId, 1000, function (events) {
            events.map(e => {
                if (e.type === 'm.room.message') {
                    assert.equal(e.content.body, "", `Draupnir did not parse the json as expected: ${e.content.body}.`)
                }
            })
        });
    })

    it('Mjölnir can query and display the query results for a partial support_page-only json.', async function () {
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:7071` });


        const draupnir = this.config.RUNTIME.client!
        let draupnirUserId = await draupnir.getUserId();

        // Check if draupnir replied
        await getMessagesByUserIn(moderator, draupnirUserId, this.mjolnir.managementRoomId, 1000, function (events) {
            events.map(e => {
                if (e.type === 'm.room.message') {
                    assert.equal(e.content.body, "", `Draupnir did not parse the json as expected: ${e.content.body}.`)
                }
            })
        });
    })

    it('Mjölnir can query and display an error for a non well-formed json.', async function () {
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:7070` });


        const draupnir = this.config.RUNTIME.client!
        let draupnirUserId = await draupnir.getUserId();

        // Check if draupnir replied
        await getMessagesByUserIn(moderator, draupnirUserId, this.mjolnir.managementRoomId, 1000, function (events) {
            events.map(e => {
                if (e.type === 'm.room.message') {
                    assert.equal(e.content.body, "", `Draupnir did not parse the json as expected: ${e.content.body}.`)
                }
            })
        });
    })
});
