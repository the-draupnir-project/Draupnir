import { MatrixClient } from "matrix-bot-sdk";
import { newTestUser } from "./clientHelper";
import { DraupnirTestContext, draupnirClient } from "./mjolnirSetupUtils";

describe("Test: Accept Invites From Space", function() {
    let client: MatrixClient|undefined;
    this.beforeEach(async function () {
        client = await newTestUser(this.config.homeserverUrl, { name: { contains: "spacee" }});
        await client.start();
    })
    this.afterEach(async function () {
        client?.stop();
    })
    it("Mjolnir should accept an invite from a user in a nominated Space", async function(this: DraupnirTestContext) {
        this.timeout(20000);

        const draupnir = this.draupnir;
        const draupnirSyncClient = draupnirClient();
        if (draupnir === undefined || draupnirSyncClient === null) {
            throw new TypeError("fixtures.ts didn't setup Draupnir");
        }

        const space = await client!.createSpace({
            name: "mjolnir space invite test",
            invites: [draupnir.clientUserID],
            isPublic: false
        });

        await draupnir.client.joinRoom(space.roomId);

        // we're mutating a static object, which may affect other tests :(
        draupnir.config.autojoinOnlyIfManager = false;
        draupnir.config.acceptInvitesFromSpace = space.roomId;

        const promise = new Promise(async resolve => {
            const newRoomId = await client!.createRoom({ invite: [draupnir.clientUserID] });
            client!.on("room.event", (roomId, event) => {
                if (
                    roomId === newRoomId
                    && event.type === "m.room.member"
                    && event.sender === draupnir.clientUserID
                    && event.content?.membership === "join"
                ) {
                    resolve(null);
                }
            });
        });
        await promise;
    } as unknown as Mocha.AsyncFunc);
});
