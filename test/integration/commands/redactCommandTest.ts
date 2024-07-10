import { strict as assert } from "assert";
import { newTestUser } from "../clientHelper";
import { getMessagesByUserIn } from "../../../src/utils";
import { LogService } from "matrix-bot-sdk";
import { getFirstReaction } from "./commandUtils";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import { MatrixClient } from "matrix-bot-sdk";

interface RedactionTestContext extends DraupnirTestContext {
    moderator?: MatrixClient;
}

describe("Test: The redaction command", function () {
    // If a test has a timeout while awaitng on a promise then we never get given control back.
    afterEach(function() {
        this.moderator?.stop();
    });

    it('Mjölnir redacts all of the events sent by a spammer when instructed to by giving their id and a room id.', async function(this: RedactionTestContext) {
        this.timeout(60000);
        // Create a few users and a room.
        let badUser = await newTestUser(this.config.homeserverUrl, { name: { contains: "spammer-needs-redacting" } });
        let badUserId = await badUser.getUserId();
        const mjolnir = this.config.RUNTIME.client!
        let mjolnirUserId = await mjolnir.getUserId();
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.draupnir!.managementRoomID);
        let targetRoom = await moderator.createRoom({ invite: [await badUser.getUserId(), mjolnirUserId]});
        await moderator.setUserPowerLevel(mjolnirUserId, targetRoom, 100);
        await badUser.joinRoom(targetRoom);
        try {
            await moderator.start();
            await getFirstReaction(moderator, this.draupnir!.managementRoomID, '✅', async () => {
                return moderator.sendMessage(this.draupnir!.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms add ${targetRoom}`});
            });
        } finally {
            moderator.stop();
        }
        LogService.debug("redactionTest", `targetRoom: ${targetRoom}, managementRoom: ${this.config.managementRoom}`);
        // Sandwich irrelevant messages in bad messages.
        await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});
        await Promise.all([...Array(50).keys()].map((i) => moderator.sendMessage(targetRoom, {msgtype: 'm.text', body: `Irrelevant Message #${i}`})));
        for (let i = 0; i < 5; i++) {
            await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});
        }
        await Promise.all([...Array(50).keys()].map((i) => moderator.sendMessage(targetRoom, {msgtype: 'm.text', body: `Irrelevant Message #${i}`})));
        await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});

        try {
            await moderator.start();
            await getFirstReaction(moderator, this.draupnir!.managementRoomID, '✅', async () => {
                return await moderator.sendMessage(this.draupnir!.managementRoomID, { msgtype: 'm.text', body: `!draupnir redact ${badUserId} --room ${targetRoom}` });
            });
        } finally {
            moderator.stop();
        }

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
        let badUser = await newTestUser(this.config.homeserverUrl, { name: { contains: "spammer-needs-redacting" } });
        let badUserId = await badUser.getUserId();
        const draupnir = this.draupnir!;
        let mjolnirUserId = await draupnir.client.getUserId();
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(draupnir.managementRoomID);
        let targetRooms: string[] = [];
        for (let i = 0; i < 5; i++) {
            let targetRoom = await moderator.createRoom({ invite: [await badUser.getUserId(), mjolnirUserId]});
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

        targetRooms.map(async targetRoom => {
            await getMessagesByUserIn(moderator, badUserId, targetRoom, 1000, function(events) {
                events.map(e => {
                    if (e.type === 'm.room.member') {
                        assert.equal(Object.keys(e.content).length, 1, "Only membership should be left on the membership even when it has been redacted.")
                    } else if (Object.keys(e.content).length !== 0) {
                        throw new Error(`This event should have been redacted: ${JSON.stringify(e, null, 2)}`)
                    }
                })
            })
        });
    } as unknown as Mocha.AsyncFunc);
    it("Redacts a single event when instructed to.", async function (this: RedactionTestContext) {
        this.timeout(60000);
        // Create a few users and a room.
        let badUser = await newTestUser(this.config.homeserverUrl, { name: { contains: "spammer-needs-redacting" } });
        const draupnir = this.draupnir!;
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(draupnir.managementRoomID);
        let targetRoom = await moderator.createRoom({ invite: [await badUser.getUserId(), draupnir.clientUserID]});
        await moderator.setUserPowerLevel(draupnir.clientUserID, targetRoom, 100);
        await badUser.joinRoom(targetRoom);
        moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms add ${targetRoom}`});
        let eventToRedact = await badUser.sendMessage(targetRoom, {msgtype: 'm.text', body: "Very Bad Stuff"});

        try {
            await moderator.start();
            await getFirstReaction(moderator, draupnir.managementRoomID, '✅', async () => {
                return await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir redact https://matrix.to/#/${encodeURIComponent(targetRoom)}/${encodeURIComponent(eventToRedact)}`});
            });
        } finally {
            moderator.stop();
        }

        let redactedEvent = await moderator.getEvent(targetRoom, eventToRedact);
        assert.equal(Object.keys(redactedEvent.content).length, 0, "This event should have been redacted");
    } as unknown as Mocha.AsyncFunc)
});
