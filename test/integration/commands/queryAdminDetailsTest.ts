import { strict as assert } from "assert";

import { newTestUser, noticeListener } from "../clientHelper";

describe("Test: The queryAdmin command", function () {
    // If a test has a timeout while awaitng on a promise then we never get given control back.
    afterEach(function () { this.moderator?.stop(); });

    it('Mjölnir can query and display the query results for a complete json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        // listener for getting the event reply
        const reply = new Promise<any>((resolve, reject) => {
            moderator.on('room.message', noticeListener(this.mjolnir.managementRoomId, (event) => {
                resolve(event);
            }))
        });

        await moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:8081` });


        const reply_event = await reply;

        assert.equal(reply_event.content.body, "", `Draupnir did not parse the json as expected: ${reply_event.content.body}.`)
    })

    it('Mjölnir can query and display the query results for a partial contacts-only json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        // listener for getting the event reply
        const reply = new Promise<any>((resolve, reject) => {
            moderator.on('room.message', noticeListener(this.mjolnir.managementRoomId, (event) => {
                resolve(event);
            }))
        });

        await moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:7072` });

        const reply_event = await reply;

        assert.equal(reply_event.content.body, "", `Draupnir did not parse the json as expected: ${reply_event.content.body}.`)
    })

    it('Mjölnir can query and display the query results for a partial support_page-only json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        // listener for getting the event reply
        const reply = new Promise<any>((resolve, reject) => {
            moderator.on('room.message', noticeListener(this.mjolnir.managementRoomId, (event) => {
                resolve(event);
            }))
        });

        await moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:7071` });

        const reply_event = await reply;

        assert.equal(reply_event.content.body, "", `Draupnir did not parse the json as expected: ${reply_event.content.body}.`)
    })

    it('Mjölnir can query and display an error for a non well-formed json.', async function () {
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);

        // listener for getting the event reply
        const reply = new Promise<any>((resolve, reject) => {
            moderator.on('room.message', noticeListener(this.mjolnir.managementRoomId, (event) => {
                resolve(event);
            }))
        });

        moderator.sendMessage(this.mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir queryAdmin http://localhost:7070` });

        const reply_event = await reply;

        assert.equal(reply_event.content.body, "", `Draupnir did not parse the json as expected: ${reply_event.content.body}.`)
    })
});
