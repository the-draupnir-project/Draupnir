import { strict as assert } from "assert";
import { newTestUser } from "../clientHelper";
import { getFirstReaction } from "./commandUtils";
import { DraupnirTestContext, draupnirClient } from "../mjolnirSetupUtils";

describe("Test: The make admin command", function () {
    it('Mjölnir make the bot self room administrator', async function (this: DraupnirTestContext) {
        this.timeout(90000);
        if (!this.config.admin?.enableMakeRoomAdminCommand) {
            this.done();
        }
        const draupnir = this.draupnir!;
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        const userA = await newTestUser(this.config.homeserverUrl, { name: { contains: "a" } });
        const userAId = await userA.getUserId();

        await moderator.joinRoom(draupnir.managementRoomID);
        const targetRoom = await moderator.createRoom({ invite: [draupnir.clientUserID], preset: "public_chat" });
        await moderator.sendMessage(draupnir.managementRoomID, { msgtype: 'm.text.', body: `!draupnir rooms add ${targetRoom}` });
        await userA.joinRoom(targetRoom);
        const powerLevelsBefore = await moderator.getRoomStateEvent(targetRoom, "m.room.power_levels", "");
        assert.notEqual(powerLevelsBefore["users"][draupnir.clientUserID], 100, `Bot should not yet be an admin of ${targetRoom}`);
        await getFirstReaction(draupnirClient()!, draupnir.managementRoomID, '✅', async () => {
            return await moderator.sendMessage(draupnir.managementRoomID, { msgtype: 'm.text', body: `!draupnir hijack room ${targetRoom} ${draupnir.clientUserID}` });
        });

        const powerLevelsAfter = await moderator.getRoomStateEvent(targetRoom, "m.room.power_levels", "");
        assert.equal(powerLevelsAfter["users"][draupnir.clientUserID], 100, "Bot should be a room admin.");
        assert.equal(powerLevelsAfter["users"][userAId], (0 || undefined), "User A is not supposed to be a room admin.");
    } as unknown as Mocha.AsyncFunc);
});
