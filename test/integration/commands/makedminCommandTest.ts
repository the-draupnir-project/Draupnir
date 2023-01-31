import { strict as assert } from "assert";
import { MjolnirTestContext } from "../mjolnirSetupUtils";
import { newTestUser } from "../clientHelper";
import { getFirstReaction } from "./commandUtils";

describe("Test: The make admin command", function () {
    it('Mjölnir make the bot self room administrator', async function (this: MjolnirTestContext) {
        this.timeout(90000);
        if (!this.config.admin?.enableMakeRoomAdminCommand) {
            this.done();
        }
        const mjolnir = this.mjolnir!;
        const mjolnirUserId = await mjolnir.client.getUserId();
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        const userA = await newTestUser(this.config.homeserverUrl, { name: { contains: "a" } });
        const userAId = await userA.getUserId();
        this.moderator = moderator;
        this.userA = userA;

        await moderator.joinRoom(this.config.managementRoom);
        let targetRoom = await moderator.createRoom({ invite: [mjolnirUserId], preset: "public_chat" });
        await moderator.sendMessage(mjolnir.managementRoomId, { msgtype: 'm.text.', body: `!mjolnir rooms add ${targetRoom}` });
        await userA.joinRoom(targetRoom);
        const powerLevelsBefore = await mjolnir.client.getRoomStateEvent(targetRoom, "m.room.power_levels", "");
        await mjolnir.matrixEmitter.start();
        assert.notEqual(powerLevelsBefore["users"][mjolnirUserId], 100, `Bot should not yet be an admin of ${targetRoom}`);
        await getFirstReaction(mjolnir.matrixEmitter, mjolnir.managementRoomId, '✅', async () => {
            return await moderator.sendMessage(mjolnir.managementRoomId, { msgtype: 'm.text', body: `!mjolnir hijack room ${targetRoom} ${mjolnirUserId}` });
        });

        const powerLevelsAfter = await mjolnir.client.getRoomStateEvent(targetRoom, "m.room.power_levels", "");
        assert.equal(powerLevelsAfter["users"][mjolnirUserId], 100, "Bot should be a room admin.");
        assert.equal(powerLevelsAfter["users"][userAId], (0 || undefined), "User A is not supposed to be a room admin.");
    });
});
