/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { AppServiceRegistration, Bridge, Request, WeakEvent, MatrixUser, Logger, setBridgeVersion, PrometheusMetrics } from "matrix-appservice-bridge";
import { MjolnirManager } from ".//MjolnirManager";
import { DataStore } from ".//datastore";
import { PgDataStore } from "./postgres/PgDataStore";
import { Api } from "./Api";
import { IConfig } from "./config/config";
import { AccessControl } from "./AccessControl";
import { AppserviceCommandHandler } from "./bot/AppserviceCommandHandler";
import { SOFTWARE_VERSION } from "../config";
import { Registry } from 'prom-client';

const log = new Logger("AppService");
/**
 * Responsible for setting up listeners and delegating functionality to a matrix-appservice-bridge `Bridge` for
 * the entrypoint of the application.
 */
export class MjolnirAppService {

    private readonly api: Api;
    private readonly commands: AppserviceCommandHandler;

    /**
     * The constructor is private because we want to ensure intialization steps are followed,
     * use `makeMjolnirAppService`.
     */
    private constructor(
        public readonly config: IConfig,
        public readonly bridge: Bridge,
        public readonly mjolnirManager: MjolnirManager,
        public readonly accessControl: AccessControl,
        private readonly dataStore: DataStore,
        private readonly prometheusMetrics: PrometheusMetrics
    ) {
        this.api = new Api(config.homeserver.url, mjolnirManager);
        this.commands = new AppserviceCommandHandler(this);
    }

    /**
     * Make and initialize the app service from the config, ready to be started.
     * @param config The appservice's config, not mjolnir's, see `src/appservice/config`.
     * @param dataStore A datastore to persist infomration about the mjolniren to.
     * @param registrationFilePath A file path to the registration file to read the namespace and tokens from.
     * @returns A new `MjolnirAppService`.
     */
    public static async makeMjolnirAppService(config: IConfig, dataStore: DataStore, registrationFilePath: string) {
        const bridge = new Bridge({
            homeserverUrl: config.homeserver.url,
            domain: config.homeserver.domain,
            registration: registrationFilePath,
            // We lazily initialize the controller to avoid null checks
            // It also allows us to combine constructor/initialize logic
            // to make the code base much simpler. A small hack to pay for an overall less hacky code base.
            controller: {
                onUserQuery: () => { throw new Error("Mjolnir uninitialized") },
                onEvent: () => { throw new Error("Mjolnir uninitialized") },
            },
            suppressEcho: false,
            disableStores: true,
        });
        await bridge.initialise();
        const accessControlListId = await bridge.getBot().getClient().resolveRoom(config.adminRoom);
        const accessControl = await AccessControl.setupAccessControl(accessControlListId, bridge);
        // Activate /metrics endpoint for Prometheus

        // This should happen automatically but in testing this didn't happen in the docker image
        setBridgeVersion(SOFTWARE_VERSION);

        // Due to the way the tests and this prom library works we need to explicitly create a new one each time.
        const prometheus = bridge.getPrometheusMetrics(true, new Registry());
        const instanceCountGauge = prometheus.addGauge({
            name: "draupnir_instances",
            help: "Count of Draupnir Instances",
            labels: ["status", "uuid"],
        });

        const mjolnirManager = await MjolnirManager.makeMjolnirManager(dataStore, bridge, accessControl, instanceCountGauge);
        const appService = new MjolnirAppService(
            config,
            bridge,
            mjolnirManager,
            accessControl,
            dataStore,
            prometheus
        );
        bridge.opts.controller = {
            onUserQuery: appService.onUserQuery.bind(appService),
            onEvent: appService.onEvent.bind(appService),
        };
        return appService;
    }

    /**
     * Start the appservice for the end user with the appropriate settings from their config and registration file.
     * @param port The port to make the appservice listen for transactions from the homeserver on (usually sourced from the cli).
     * @param config The parsed configuration file.
     * @param registrationFilePath A path to their homeserver registration file.
     */
    public static async run(port: number, config: IConfig, registrationFilePath: string): Promise<MjolnirAppService> {
        Logger.configure(config.logging ?? { console: "debug" });
        const dataStore = new PgDataStore(config.db.connectionString);
        await dataStore.init();
        const service = await MjolnirAppService.makeMjolnirAppService(config, dataStore, registrationFilePath);
        // The call to `start` MUST happen last. As it needs the datastore, and the mjolnir manager to be initialized before it can process events from the homeserver.
        await service.start(port);
        return service;
    }

    public onUserQuery(queriedUser: MatrixUser) {
        return {}; // auto-provision users with no additonal data
    }

    /**
     * Handle an individual event pushed by the homeserver to us.
     * This function is async (and anything downstream would be anyway), which does mean that events can be processed out of order.
     * Not a huge problem for us, but is something to be aware of.
     * @param request A matrix-appservice-bridge request encapsulating a Matrix event.
     * @param context Additional context for the Matrix event.
     */
    public async onEvent(request: Request<WeakEvent>) {
        const mxEvent = request.getData();
        // Provision a new mjolnir for the invitee when the appservice bot (designated by this.bridge.botUserId) is invited to a room.
        // Acts as an alternative to the web api provided for the widget.
        if ('m.room.member' === mxEvent.type) {
            if ('invite' === mxEvent.content['membership'] && mxEvent.state_key === this.bridge.botUserId) {
                log.info(`${mxEvent.sender} has sent an invitation to the appservice bot ${this.bridge.botUserId}, attempting to provision them a mjolnir`);
                try {
                    await this.mjolnirManager.provisionNewMjolnir(mxEvent.sender)
                } catch (e: any) {
                    log.error(`Failed to provision a mjolnir for ${mxEvent.sender} after they invited ${this.bridge.botUserId}:`, e);
                    // continue, we still want to reject this invitation.
                }
                try {
                    // reject the invite to keep the room clean and make sure the invetee doesn't get confused and think this is their mjolnir.
                    await this.bridge.getBot().getClient().leaveRoom(mxEvent.room_id);
                } catch (e: any) {
                    log.warn("Unable to reject an invite to a room", e);
                }
            }
        }
        this.accessControl.handleEvent(mxEvent['room_id'], mxEvent);
        this.mjolnirManager.onEvent(request);
        this.commands.handleEvent(mxEvent);
    }

    /**
     * Start the appservice. See `run`.
     * @param port The port that the appservice should listen on to receive transactions from the homeserver.
     */
    private async start(port: number) {
        await this.bridge.getBot().getClient().joinRoom(this.config.adminRoom);
        log.info("Starting MjolnirAppService, Matrix-side to listen on port", port);
        this.api.start(this.config.webAPI.port);
        await this.bridge.listen(port);
        this.prometheusMetrics.addAppServicePath(this.bridge);
        this.bridge.addAppServicePath({
            method: "GET",
            path: "/healthz",
            authenticate: false,
            handler: async (_req, res) => {
                res.status(200).send('ok');
            }
        });
        log.info("MjolnirAppService started successfully");
    }

    /**
     * Stop listening to requests from both the homeserver and web api and disconnect from the datastore.
     */
    public async close(): Promise<void> {
        await this.bridge.close();
        await this.dataStore.close();
        await this.api.close();
    }

    /**
     * Generate a registration file for a fresh deployment of the appservice.
     * Included to satisfy `matrix-appservice-bridge`'s `Cli` utility which allows a registration file to be registered when setting up a deployment of an appservice.
     * @param reg Any existing parameters to be included in the registration, to be mutated by this method.
     * @param callback To call when the registration has been generated with the final registration.
     */
    public static generateRegistration(reg: AppServiceRegistration, callback: (finalRegistration: AppServiceRegistration) => void) {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart('draupnir-moderation');
        reg.addRegexPattern("users", "@mjolnir_.*", true);
        reg.setRateLimited(false);
        callback(reg);
    }
}
