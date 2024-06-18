import { strict as assert } from "assert";
import { newTestUser } from "../clientHelper";
import { getFirstReaction, getFirstReply } from "./commandUtils";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import { MatrixClient } from 'matrix-bot-sdk';

interface RoomsTestContext extends DraupnirTestContext {
    moderator?: MatrixClient;
}

describe("Test: The rooms commands", function () {
    // If a test has a timeout while awaitng on a promise then we never get given control back.
    afterEach(function() {
        this.moderator?.stop();
    });

    it('Mjolnir can protect a room, show that it is protected and then stop protecting the room.', async function(this: RoomsTestContext) {
        // Create a few users and a room.
        const draupnir = this.draupnir!;
        let moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        this.moderator = moderator;
        await moderator.joinRoom(draupnir.managementRoomID);
        let targetRoom = await moderator.createRoom({ invite: [draupnir.clientUserID]});
        await moderator.setUserPowerLevel(draupnir.clientUserID, targetRoom, 100);

        try {
            await moderator.start();
            await getFirstReaction(moderator, draupnir.managementRoomID, '✅', async () => {
                return await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms add ${targetRoom}`});
            });
            let protectedRoomsMessage = await getFirstReply(moderator, draupnir.managementRoomID, async () => {
                return await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms`});
            })
            assert.equal(protectedRoomsMessage['content']?.['body']?.includes('2'), true, "There should be two protected rooms (including the management room)");
            await getFirstReaction(moderator, draupnir.managementRoomID, '✅', async () => {
                return await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms remove ${targetRoom}`});
            });
            protectedRoomsMessage = await getFirstReply(moderator, draupnir.managementRoomID, async () => {
                return await moderator.sendMessage(draupnir.managementRoomID, {msgtype: 'm.text', body: `!draupnir rooms`});
            })
            assert.equal(protectedRoomsMessage['content']?.['body']?.includes('1'), true, "Only the management room should be protected.");
        } finally {
            moderator.stop();
        }
    } as unknown as Mocha.AsyncFunc)
})
