import expect from "expect";
import { Mjolnir } from "../../src/Mjolnir";
import { newTestUser } from "./clientHelper";
import { getFirstEventMatching } from './commands/commandUtils';
import { RULE_USER } from "../../src/models/ListRule";
import { MatrixRoomReference } from "../../src/commands/interface-manager/MatrixRoomReference";

// We will need to disable this in tests that are banning people otherwise it will cause
// mocha to hang for awhile until it times out waiting for a response to a prompt.
describe("Ban propagation test", function() {
    it("Should be enabled by default", async function() {
        const mjolnir: Mjolnir = this.mjolnir
        expect(mjolnir.protectionManager.getProtection("BanPropagationProtection")?.enabled).toBeTruthy();
    })
    it("Should prompt to add bans to a policy list, then add the ban", async function() {
        const mjolnir: Mjolnir = this.mjolnir
        const mjolnirId = await mjolnir.client.getUserId();
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        await moderator.joinRoom(mjolnir.managementRoomId);
        const protectedRooms = await Promise.all([...Array(5)].map(async _ => {
            const room = await moderator.createRoom({ invite: [mjolnirId] });
            await mjolnir.client.joinRoom(room);
            await moderator.setUserPowerLevel(mjolnirId, room, 100);
            await mjolnir.addProtectedRoom(room);
            return room;
        }));
        // create a policy list so that we can check it for a user rule later
        const policyListId = await moderator.createRoom({ invite: [mjolnirId] });
        await moderator.setUserPowerLevel(mjolnirId, policyListId, 100);
        await mjolnir.client.joinRoom(policyListId);
        await mjolnir.policyListManager.watchList(MatrixRoomReference.fromRoomId(policyListId));

        // check for the prompt
        const promptEvent = await getFirstEventMatching({
            matrix: mjolnir.matrixEmitter,
            targetRoom: mjolnir.managementRoomId,
            lookAfterEvent: async function () {
                // ban a user in one of our protected rooms using the moderator
                await moderator.banUser('@test:example.com', protectedRooms[0], "spam");
                return undefined;
            },
            predicate: function (event: any): boolean {
                return (event['content']?.['body'] ?? '').startsWith('The user')
            }
        })
        // select the prompt
        await moderator.unstableApis.addReactionToEvent(
            mjolnir.managementRoomId, promptEvent['event_id'], '1.'
        );
        // check the policy list, after waiting a few seconds.
        await new Promise(resolve => setTimeout(resolve, 10000));
        const policyList = mjolnir.policyListManager.lists[0];
        const rules = policyList.rulesMatchingEntity('@test:example.com', RULE_USER);
        expect(rules.length).toBe(1);
        expect(rules[0].entity).toBe('@test:example.com');
        expect(rules[0].reason).toBe('spam');

        // now unban them >:3
        const unbanPrompt = await getFirstEventMatching({
            matrix: mjolnir.matrixEmitter,
            targetRoom: mjolnir.managementRoomId,
            lookAfterEvent: async function () {
                // ban a user in one of our protected rooms using the moderator
                await moderator.unbanUser('@test:example.com', protectedRooms[0]);
                return undefined;
            },
            predicate: function (event: any): boolean {
                return (event['content']?.['body'] ?? '').startsWith('The user')
            }
        });

        await moderator.unstableApis.addReactionToEvent(
            mjolnir.managementRoomId, unbanPrompt['event_id'], 'unban from all'
        );
        await new Promise(resolve => setTimeout(resolve, 10000));
        const rulesAfterUnban = policyList.rulesMatchingEntity('@test:example.com', RULE_USER);
        expect(rulesAfterUnban.length).toBe(0);
    })
})
