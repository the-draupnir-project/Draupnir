/**
 * This file is used to launch mjolnir for manual testing, creating a user and management room automatically if it doesn't already exist.
 */

import { draupnirClient, makeMjolnir } from "./mjolnirSetupUtils";
import { read as configRead } from '../../src/config';
import { constructWebAPIs } from "../../src/DraupnirBotMode";
import { makeDraupnirFactoryForIntegrationTest } from "./clientProviderUtils";

(async () => {
    const config = configRead();

    let mjolnir = await makeMjolnir(config, makeDraupnirFactoryForIntegrationTest());
    await mjolnir.start();
    const apis = constructWebAPIs(mjolnir);
    await draupnirClient()?.start();
    await apis.start();
})();
