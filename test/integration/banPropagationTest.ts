import expect from "expect";
import { newTestUser } from "./clientHelper";
import { getFirstEventMatching } from './commands/commandUtils';
import { DraupnirTestContext, draupnirClient } from "./mjolnirSetupUtils";
import { MatrixRoomReference, PolicyRuleType, PropagationType, StringRoomID, findProtection } from "matrix-protection-suite";

// We will need to disable this in tests that are banning people otherwise it will cause
// mocha to hang for awhile until it times out waiting for a response to a prompt.
describe("Ban propagation test", function() {
    it("Should be enabled by default", async function(this: DraupnirTestContext) {
        const draupnir = this.draupnir;
        if (draupnir === undefined) {
            throw new TypeError(`setup didn't run properly`);
        }
        const banPropagationProtection = findProtection("BanPropagationProtection");
        if (banPropagationProtection === undefined) {
            throw new TypeError(`should be able to find the ban propagation protection`);
        }
        expect(draupnir.protectedRoomsSet.protections.isEnabledProtection(banPropagationProtection)).toBeTruthy();
    } as unknown as Mocha.AsyncFunc)
    it("Should prompt to add bans to a policy list, then add the ban", async function(this: DraupnirTestContext) {
        const draupnir = this.draupnir;
        if (draupnir === undefined) {
            throw new TypeError(`setup didn't run properly`);
        }
        const moderator = await newTestUser(this.config.homeserverUrl, { name: { contains: "moderator" } });
        await moderator.joinRoom(draupnir.managementRoomID);
        const protectedRooms = await Promise.all([...Array(5)].map(async _ => {
            const room = await moderator.createRoom({ invite: [draupnir.clientUserID] });
            await draupnir.client.joinRoom(room);
            await moderator.setUserPowerLevel(draupnir.clientUserID, room, 100);
            await draupnir.protectedRoomsSet.protectedRoomsConfig.addRoom(MatrixRoomReference.fromRoomID(room as StringRoomID));
            return room;
        }));
        // create a policy list so that we can check it for a user rule later
        const policyListId = await moderator.createRoom({ invite: [draupnir.clientUserID] });
        await moderator.setUserPowerLevel(draupnir.clientUserID, policyListId, 100);
        await draupnir.client.joinRoom(policyListId);
        await draupnir.protectedRoomsSet.issuerManager.watchList(PropagationType.Direct, MatrixRoomReference.fromRoomID(policyListId as StringRoomID), {});

        // check for the prompt
        const promptEvent = await getFirstEventMatching({
            matrix: draupnirClient()!,
            targetRoom: draupnir.managementRoomID,
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
            draupnir.managementRoomID, promptEvent['event_id'], '1️⃣'
        );
        // check the policy list, after waiting a few seconds.
        await new Promise(resolve => setTimeout(resolve, 10000));

        const policyListRevisionAfterBan = draupnir.protectedRoomsSet.issuerManager.policyListRevisionIssuer.currentRevision;
        const rules = policyListRevisionAfterBan.allRulesMatchingEntity('@test:example.com', PolicyRuleType.User);
        expect(rules.length).toBe(1);
        expect(rules[0].entity).toBe('@test:example.com');
        expect(rules[0].reason).toBe('spam');

        // now unban them >:3
        const unbanPrompt = await getFirstEventMatching({
            matrix: draupnirClient()!,
            targetRoom: draupnir.managementRoomID,
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
            draupnir.managementRoomID, unbanPrompt['event_id'], 'unban from all'
        );
        await new Promise(resolve => setTimeout(resolve, 10000));
        const policyListRevisionAfterUnBan = draupnir.protectedRoomsSet.issuerManager.policyListRevisionIssuer.currentRevision;

        const rulesAfterUnban = policyListRevisionAfterUnBan.allRulesMatchingEntity('@test:example.com', PolicyRuleType.User);
        expect(rulesAfterUnban.length).toBe(0);
    } as unknown as Mocha.AsyncFunc)
})
