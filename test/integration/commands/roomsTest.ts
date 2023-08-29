import { strict as assert } from "assert";
import { newTestUser } from "../clientHelper";
import { getFirstReaction, getFirstReply } from "./commandUtils";

describe("Test: The rooms commands", function () {
    // If a test has a timeout while awaitng on a promise then we never get given control back.
    afterEach(function() { this.moderator?.stop(); });

    it('Mjolnir can protect a room, show that it is protected and then stop protecting the room.', async function() {
        // Create a few users and a room.
        const mjolnir = this.mjolnir.client;
        let mjolnirUserId = await mjolnir.getUserId();
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(this.config.managementRoom);
        let targetRoom = await moderator.createRoom({ invite: [mjolnirUserId]});
        await moderator.setUserPowerLevel(mjolnirUserId, targetRoom, 100);

        try {
            await moderator.start();
            await getFirstReaction(moderator, this.mjolnir.managementRoomId, '✅', async () => {
                return await moderator.sendMessage(this.mjolnir.managementRoomId, {msgtype: 'm.text', body: `!mjolnir rooms add ${targetRoom}`});
            });
            let protectedRoomsMessage = await getFirstReply(moderator, this.mjolnir.managementRoomId, async () => {
                return await moderator.sendMessage(this.mjolnir.managementRoomId, {msgtype: 'm.text', body: `!mjolnir rooms`});
            })
            assert.equal(protectedRoomsMessage['content']?.['body']?.includes('1'), true, "There should be one protected room");
            await getFirstReaction(moderator, this.mjolnir.managementRoomId, '✅', async () => {
                return await moderator.sendMessage(this.mjolnir.managementRoomId, {msgtype: 'm.text', body: `!mjolnir rooms remove ${targetRoom}`});
            });
            protectedRoomsMessage = await getFirstReply(moderator, this.mjolnir.managementRoomId, async () => {
                return await moderator.sendMessage(this.mjolnir.managementRoomId, {msgtype: 'm.text', body: `!mjolnir rooms`});
            })
            assert.equal(protectedRoomsMessage['content']?.['body']?.includes('0'), true, "There room should no longer be protected");
        } finally {
            moderator.stop();
        }
    })
})
