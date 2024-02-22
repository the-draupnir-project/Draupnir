import { MatrixClient } from "matrix-bot-sdk";
import { newTestUser } from "./clientHelper";
import { DraupnirTestContext } from "./mjolnirSetupUtils";
import { ActionResult, DEFAULT_CONSEQUENCE_PROVIDER, MatrixRoomReference, Ok, Protection, ProtectionDescription, StandardProtectionSettings, StringRoomID, findConsequenceProvider } from "matrix-protection-suite";

describe("Test: Report polling", function() {
    let client: MatrixClient;
    this.beforeEach(async function () {
        client = await newTestUser(this.config.homeserverUrl, { name: { contains: "protection-settings" }});
    })
    it("Mjolnir correctly retrieves a report from synapse", async function(this: DraupnirTestContext) {
        this.timeout(40000);
        const draupnir = this.draupnir;
        if (draupnir === undefined) {
            throw new TypeError(`Test didn't setup properly`);
        }
        let protectedRoomId = await draupnir.client.createRoom({ invite: [await client.getUserId()] });
        await client.joinRoom(protectedRoomId);
        await draupnir.protectedRoomsSet.protectedRoomsConfig.addRoom(MatrixRoomReference.fromRoomID(protectedRoomId as StringRoomID));

        const eventId = await client.sendMessage(protectedRoomId, {msgtype: "m.text", body: "uwNd3q"});
        await new Promise(async resolve => {
            const testProtectionDescription: ProtectionDescription = {
                name: "jYvufI",
                description: "A test protection",
                factory: function (description, consequenceProvider, protectedRoomsSet, context, settings): ActionResult<Protection> {
                    return Ok({
                        handleEventReport(report) {
                            if (report.reason === "x5h1Je") {
                                resolve(null);
                            }
                            return Promise.resolve(Ok(undefined));
                        },
                        description: testProtectionDescription,
                        requiredEventPermissions: [],
                        requiredPermissions: []
                    })
                },
                protectionSettings: new StandardProtectionSettings(
                    {},
                    {}
                )
            }
            const defaultConsequenceProvider = findConsequenceProvider(DEFAULT_CONSEQUENCE_PROVIDER);
            if (defaultConsequenceProvider === undefined) {
                throw new TypeError(`Default consequence provider should be defined mate`);
            }
            await draupnir.protectedRoomsSet.protections.addProtection(testProtectionDescription, defaultConsequenceProvider, draupnir.protectedRoomsSet, draupnir);
            await client.doRequest(
                "POST",
                `/_matrix/client/r0/rooms/${encodeURIComponent(protectedRoomId)}/report/${encodeURIComponent(eventId)}`, "", {
                    reason: "x5h1Je"
                }
            );
        });
        // So I kid you not, it seems like we can quit before the webserver for reports sends a respond to the client (via L#26)
        // because the promise above gets resolved before we finish awaiting the report sending request on L#31,
        // then mocha's cleanup code runs (and shuts down the webserver) before the webserver can respond.
        // Wait a minute 😲😲🤯 it's not even supposed to be using the webserver if this is testing report polling.
        // Ok, well apparently that needs a big refactor to change, but if you change the config before running this test,
        // then you can ensure that report polling works. https://github.com/matrix-org/mjolnir/issues/326.
        await new Promise(resolve => setTimeout(resolve, 1000));
    } as unknown as Mocha.AsyncFunc);
});
