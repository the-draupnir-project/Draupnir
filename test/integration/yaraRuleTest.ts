import { strict as assert } from "assert";

import { Mjolnir } from "../../src/Mjolnir";
import { createBanList, getFirstEventMatching } from "./commands/commandUtils";
import { newTestUser } from "./clientHelper";
import { YaraDetection } from "../../src/protections/YaraDetection";
import { MatrixClient } from "matrix-bot-sdk";


interface Context extends Mocha.Context {
    mjolnir: Mjolnir;

    yara_rules: YaraDetection;
    moderator: MatrixClient;
    bad_user: MatrixClient;
    protected_room: string;
}

/**
 * This tests the yara protection. It tries to NOT test yara functionality.
 * Yara specific tests are covered in the @node-yara-rs/node-yara-rs package
 * itself.
 */
describe("Test: YaraDetection protection", function () {
    beforeEach(async function (this: Context) {
        // Setup an instance of YaraDetection
        this.yara_rules = new YaraDetection();
        await this.mjolnir.protectionManager.registerProtection(this.yara_rules);
        await this.mjolnir.protectionManager.enableProtection("YaraDetection");

        // Setup a moderator.
        this.moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        await this.moderator.joinRoom(this.mjolnir.managementRoomId);

        // Setup a bad_user.
        this.bad_user = await newTestUser(this.config.homeserverUrl, { name: { contains: "bad_user" } });

        // Setup a protected room
        const mjolnirId = await this.mjolnir.client.getUserId();
        this.protected_room = await this.moderator.createRoom({ invite: [mjolnirId, await this.bad_user.getUserId()] });
        await this.mjolnir.client.joinRoom(this.protected_room);
        await this.bad_user.joinRoom(this.protected_room);
        await this.mjolnir.client.joinRoom(this.protected_room);
        await this.moderator.setUserPowerLevel(mjolnirId, this.protected_room, 100);
        await this.mjolnir.addProtectedRoom(this.protected_room);

        // Setup a policy list
        const banList = await createBanList(this.mjolnir.managementRoomId, this.mjolnir.matrixEmitter, this.moderator);
        this.yara_rules.settings.banPolicyList.setValue(this.mjolnir.policyListManager.resolveListShortcode(banList)!.roomId);
    });

    afterEach(async function (this: Context) {
        await this.moderator?.stop();
        await this.bad_user?.stop();
    });

    it('Should notify about a match in the admin room', async function (this: Context) {
        // check for the warning
        const event = await getFirstEventMatching({
            matrix: this.mjolnir.matrixEmitter,
            targetRoom: this.mjolnir.managementRoomId,
            lookAfterEvent: async () => {
                // Send a message that issues a warning
                await this.bad_user.sendText(this.protected_room, "Test");
                return undefined;
            },
            predicate: (event: any): boolean => {
                return (event['content']?.['body'] ?? '').includes('YARA rule matched for event')
            }
        })

        assert.notStrictEqual(event, undefined)
    });

    it('Should notify the user in the room', async function (this: Context) {
        // check for the warning
        const event = await getFirstEventMatching({
            matrix: this.mjolnir.matrixEmitter,
            targetRoom: this.protected_room,
            lookAfterEvent: async () => {
                // Send a message that issues a warning
                await this.bad_user.sendText(this.protected_room, "Notify user");
                return undefined;
            },
            predicate: (event: any): boolean => {
                return (event['content']?.['body'] ?? '').includes('Please don\'t')
            }
        })

        assert.notStrictEqual(event, undefined)
    });
});
