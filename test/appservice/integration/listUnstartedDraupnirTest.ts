import expect from "expect";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { AppservideBotCommandClient } from "../utils/AppserviceBotCommandClient";
import { setupHarness } from "../utils/harness";
import { isError } from "matrix-protection-suite";

interface Context extends Mocha.Context {
    appservice?:  MjolnirAppService
}

describe("Just test some commands innit", function() {
    beforeEach(async function(this: Context) {
        this.appservice = await setupHarness();
    });
    afterEach(function(this: Context) {
        if (this.appservice) {
            return this.appservice.close();
        } else {
            console.warn("Missing Appservice in this context, so cannot stop it.")
            return Promise.resolve(); // TS7030: Not all code paths return a value.
        }
    });
    it("Can list any unstarted draupnir", async function(this: Context) {
        const commandClient = new AppservideBotCommandClient(this.appservice!);
        const result = await commandClient.sendCommand("list", "unstarted");
        if (isError(result)) {
            throw new TypeError(`Command should have succeeded`);
        }
        expect(result.ok).toBeInstanceOf(Array);
    });
})
