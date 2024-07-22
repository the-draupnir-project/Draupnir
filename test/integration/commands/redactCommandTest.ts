import { strict as assert } from "assert";
import { newTestUser } from "../clientHelper";
import { getMessagesByUserIn } from "../../../src/utils";
import { LogService } from "matrix-bot-sdk";
import { getFirstReaction } from "./commandUtils";
import { draupnirClient, draupnirSafeEmitter, DraupnirTestContext } from "../mjolnirSetupUtils";
import { MatrixClient } from "matrix-bot-sdk";

interface RedactionTestContext extends DraupnirTestContext {
    moderator?: MatrixClient;
}

describe("Test: The redaction command", function () {
    // If a test has a timeout while awaitng on a promise then we never get given control back.
    afterEach(function() {
        this.moderator?.stop();
    });

    it.only('Mjölnir redacts all of the events sent by a spammer when instructed to by giving their id and a room id.', async function(this: RedactionTestContext) {
        this.timeout(60000);
        // Create a few users and a room.
        const badUser = await newTestUser(this.config.homeserverUrl, { name: { contains: "spammer-needs-redacting" } });
        const badUserId = await badUser.getUserId();
        const draupnirMatrixClient = draupnirClient();
        const draupnir = this.draupnir;
        if (draupnirMatrixClient === null || draupnir === undefined) {
            throw new TypeError(`Test isn't setup correctly`);
        }
        const mjolnirUserId = await draupnirMatrixClient.getUserId();
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        const targetRoom = await moderator.createRoom({ invite: [await badUser.getUserId(), mjolnirUserId]});
        await moderator.setUserPowerLevel(mjolnirUserId, targetRoom, 100);
        await badUser.joinRoom(targetRoom);
        await getFirstReaction(draupnirSafeEmitter(), draupnir.managementRoomID, '✅', async () => {
            return moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms add ${targetRoom}`});
        });
        LogService.debug("redactionTest", `targetRoom: ${targetRoom}, managementRoom: ${this.config.managementRoom}`);
        // Sandwich irrelevant messages in bad messages.
        await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});
        await Promise.all([...Array(50).keys()].map((i) => moderator.sendMessage(targetRoom, {msgtype: 'm.text', body: `Irrelevant Message #${i}`})));
        for (let i = 0; i < 5; i++) {
            await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});
        }
        await Promise.all([...Array(50).keys()].map((i) => moderator.sendMessage(targetRoom, {msgtype: 'm.text', body: `Irrelevant Message #${i}`})));
        await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});

        await getFirstReaction(draupnirSafeEmitter(), draupnir.managementRoomID, '✅', async () => {
            return await moderator.sendMessage(draupnir.managementRoomID, { msgtype: 'm.text', body: `!draupnir redact ${badUserId} --room ${targetRoom}` });
        });

        await getMessagesByUserIn(moderator, badUserId, targetRoom, 1000, function(events) {
            events.map(e => {
                if (e.type === 'm.room.member') {
                    assert.equal(Object.keys(e.content).length, 1, "Only membership should be left on the membership even when it has been redacted.")
                } else if (Object.keys(e.content).length !== 0) {
                    throw new Error(`This event should have been redacted: ${JSON.stringify(e, null, 2)}`)
                }
            })
        });
    } as unknown as Mocha.AsyncFunc)

    it('Mjölnir redacts all of the events sent by a spammer when instructed to by giving their id in multiple rooms.', async function(this: RedactionTestContext) {
        this.timeout(60000);
        // Create a few users and a room.
        const badUser = await newTestUser(this.config.homeserverUrl, { name: { contains: "spammer-needs-redacting" } });
        const badUserId = await badUser.getUserId();
        const draupnir = this.draupnir;
        if (draupnir === undefined) {
            throw new TypeError(`Test isn't setup correctly`);
        }
        const mjolnirUserId = await draupnir.client.getUserId();
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        const targetRooms: string[] = [];
        for (let i = 0; i < 5; i++) {
            const targetRoom = await moderator.createRoom({ invite: [await badUser.getUserId(), mjolnirUserId]});
            await moderator.setUserPowerLevel(mjolnirUserId, targetRoom, 100);
            await badUser.joinRoom(targetRoom);
            await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms add ${targetRoom}`});
            targetRooms.push(targetRoom);

            // Sandwich irrelevant messages in bad messages.
            await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});
            await Promise.all([...Array(50).keys()].map((j) => moderator.sendMessage(targetRoom, {msgtype: 'm.text', body: `Irrelevant Message #${j}`})));
            for (let j = 0; j < 5; j++) {
                await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});
            }
            await Promise.all([...Array(50).keys()].map((j) => moderator.sendMessage(targetRoom, {msgtype: 'm.text', body: `Irrelevant Message #${j}`})));
            await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});
        }

        try {
            await moderator.start();
            await getFirstReaction(moderator, draupnir.managementRoomID, '✅', async () => {
                return await moderator.sendMessage(draupnir.managementRoomID, { msgtype: 'm.text', body: `!draupnir redact ${badUserId}` });
            });
        } finally {
            moderator.stop();
        }

        await Promise.all(targetRooms.map(async targetRoom => {
            await getMessagesByUserIn(moderator, badUserId, targetRoom, 1000, function(events) {
                events.map(e => {
                    if (e.type === 'm.room.member') {
                        assert.equal(Object.keys(e.content).length, 1, "Only membership should be left on the membership even when it has been redacted.")
                    } else if (Object.keys(e.content).length !== 0) {
                        throw new Error(`This event should have been redacted: ${JSON.stringify(e, null, 2)}`)
                    }
                })
            })
        }));
    } as unknown as Mocha.AsyncFunc);
    it("Redacts a single event when instructed to.", async function (this: RedactionTestContext) {
        this.timeout(60000);
        // Create a few users and a room.
        const badUser = await newTestUser(this.config.homeserverUrl, { name: { contains: "spammer-needs-redacting" } });
        const draupnir = this.draupnir;
        if (draupnir === undefined) {
            throw new TypeError(`Test isn't setup correctly`);
        }
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        const targetRoom = await moderator.createRoom({ invite: [await badUser.getUserId(), draupnir.clientUserID]});
        await moderator.setUserPowerLevel(draupnir.clientUserID, targetRoom, 100);
        await badUser.joinRoom(targetRoom);
        await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms add ${targetRoom}`});
        const eventToRedact = await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});

        try {
            await moderator.start();
            await getFirstReaction(moderator, draupnir.managementRoomID, '✅', async () => {
                return await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir redact https://matrix.to/#/${encodeURIComponent(targetRoom)}/${encodeURIComponent(eventToRedact)}`});
            });
        } finally {
            moderator.stop();
        }

        const redactedEvent = await moderator.getEvent(targetRoom, eventToRedact);
        assert.equal(Object.keys(redactedEvent.content).length, 0, "This event should have been redacted");
    } as unknown as Mocha.AsyncFunc)
});
