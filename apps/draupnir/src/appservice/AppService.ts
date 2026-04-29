// Copyright 2022 The Matrix.org Foundation C.I.C.
// SPDX-FileCopyrightText: 2023 - 2026 Gnuxie <Gnuxie@protonmail.com>
// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  AppServiceRegistration,
  Bridge,
  Request,
  WeakEvent,
  MatrixUser,
  Logger,
  setBridgeVersion,
  PrometheusMetrics,
} from "matrix-appservice-bridge";
import { DataStore } from ".//datastore";
import { PgDataStore } from "./postgres/PgDataStore";
import { AppserviceConfig } from "./config/config";
import { AccessControl } from "./AccessControl";
import { AppserviceCommandHandler } from "./bot/AppserviceCommandHandler";
import { getStoragePath, SOFTWARE_VERSION } from "../config";
import { Registry } from "prom-client";
import {
  BotSDKMatrixAccountData,
  ClientCapabilityFactory,
  RoomStateManagerFactory,
  joinedRoomsSafe,
  resultifyBotSDKRequestError,
  resultifyBotSDKRequestErrorWith404AsUndefined,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  ClientsInRoomMap,
  DefaultEventDecoder,
  EventDecoder,
  Ok,
  StandardClientsInRoomMap,
  Task,
  isError,
} from "matrix-protection-suite";
import { AppServiceDraupnirManager } from "./AppServiceDraupnirManager";
import {
  StringRoomID,
  StringUserID,
  userLocalpart,
} from "@the-draupnir-project/matrix-basic-types";
import { SqliteRoomStateBackingStore } from "../backingstore/better-sqlite3/SqliteRoomStateBackingStore";
import { TopLevelStores } from "../backingstore/DraupnirStores";
import { patchMatrixClient } from "../utils";
import { Result } from "@gnuxie/typescript-result";
import {
  loadZeroTouchDeployRoomFromConfig,
  ZERO_TOUCH_DEPLOY_ROOM_ACCOUNT_DATA_TYPE,
  ZeroTouchDeployRoomAccountDataSchema,
} from "../managedRoomAccountData";

const log = new Logger("AppService");
/**
 * Responsible for setting up listeners and delegating functionality to a matrix-appservice-bridge `Bridge` for
 * the entrypoint of the application.
 */
export class MjolnirAppService {
  public readonly commands: AppserviceCommandHandler;

  /**
   * The constructor is private because we want to ensure intialization steps are followed,
   * use `makeMjolnirAppService`.
   */
  private constructor(
    public readonly config: AppserviceConfig,
    public readonly bridge: Bridge,
    public readonly draupnirManager: AppServiceDraupnirManager,
    public readonly accessControl: AccessControl,
    private readonly dataStore: DataStore,
    private readonly eventDecoder: EventDecoder,
    private readonly roomStateManagerFactory: RoomStateManagerFactory,
    private readonly clientCapabilityFactory: ClientCapabilityFactory,
    private readonly clientsInRoomMap: ClientsInRoomMap,
    private readonly prometheusMetrics: PrometheusMetrics,
    public readonly accessControlRoomID: StringRoomID,
    public readonly botUserID: StringUserID
  ) {
    const client = this.bridge.getBot().getClient();
    this.commands = new AppserviceCommandHandler(
      botUserID,
      client,
      accessControlRoomID,
      this.clientCapabilityFactory.makeClientPlatform(botUserID, client),
      this
    );
  }

  private static async ensureAppserviceBotProfile(
    bridge: Bridge,
    botUserID: StringUserID
  ): Promise<Result<void>> {
    const botIntent = bridge.getIntent(botUserID);
    const registrationResult = await botIntent
      // There seems to be a bug in the matrix-appservice-bridge does not create the profile.
      // https://github.com/matrix-org/matrix-appservice-bridge/issues/525
      .ensureRegistered(true)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
    if (isError(registrationResult)) {
      return registrationResult.elaborate(
        "Failed to register the main appservice bot user"
      );
    }
    const botProfileResult = await botIntent.matrixClient
      .getUserProfile(botUserID)
      .then(
        (value) => Ok(value),
        resultifyBotSDKRequestErrorWith404AsUndefined
      );
    if (isError(botProfileResult)) {
      return botProfileResult.elaborate(
        "Unable to fetch appservice bot profile information"
      );
    }
    // The code beyond this point is redundant in Synapse but we don't know
    // if other implementations set the profile up when an appservice user is
    // registered.
    const extractDisplayName = (profile: unknown) => {
      if (typeof profile !== "object" || profile === null) {
        return undefined;
      }
      if ("displayname" in profile && typeof profile.displayname === "string") {
        return profile.displayname;
      }
      return undefined;
    };
    const botDisplayName = extractDisplayName(botProfileResult.ok);
    if (botDisplayName !== undefined && botDisplayName !== "") {
      return Ok(undefined); // displayname is already set, nothing to do.
    }
    const setDisplaynameResult = await botIntent
      .setDisplayName(userLocalpart(botUserID))
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
    if (isError(setDisplaynameResult)) {
      return setDisplaynameResult.elaborate(
        `Unable to set appservice bot displayname during startup`
      );
    }
    return Ok(undefined);
  }

  /**
   * Make and initialize the app service from the config, ready to be started.
   * @param config The appservice's config, not draupnirs's, see `src/appservice/config`.
   * @param dataStore A datastore to persist infomration about the draupnir to.
   * @param registrationFilePath A file path to the registration file to read the namespace and tokens from.
   * @returns A new `MjolnirAppService`.
   */
  public static async makeMjolnirAppService(
    config: AppserviceConfig,
    dataStore: DataStore,
    eventDecoder: EventDecoder,
    registrationFilePath: string,
    stores: TopLevelStores
  ) {
    const bridge = new Bridge({
      homeserverUrl: config.homeserver.url,
      domain: config.homeserver.domain,
      registration: registrationFilePath,
      // We lazily initialize the controller to avoid null checks
      // It also allows us to combine constructor/initialize logic
      // to make the code base much simpler. A small hack to pay for an overall less hacky code base.
      controller: {
        onUserQuery: () => {
          throw new Error("Draupnir uninitialized");
        },
        onEvent: () => {
          throw new Error("Draupnir uninitialized");
        },
      },
      suppressEcho: false,
      disableStores: true,
    });
    await bridge.initialise();
    const clientsInRoomMap = new StandardClientsInRoomMap();
    const clientProvider = async (clientUserID: StringUserID) =>
      bridge.getIntent(clientUserID).matrixClient;
    const roomStateManagerFactory = new RoomStateManagerFactory(
      clientsInRoomMap,
      clientProvider,
      eventDecoder,
      stores.roomStateBackingStore,
      stores.hashStore
    );
    const clientCapabilityFactory = new ClientCapabilityFactory(
      clientsInRoomMap,
      eventDecoder
    );
    const botUserID = bridge.getBot().getUserId() as StringUserID;
    (
      await clientsInRoomMap.makeClientRooms(botUserID, async () =>
        joinedRoomsSafe(bridge.getBot().getClient())
      )
    ).expect("Unable to initialize client rooms for the appservice bot user");
    const clientPlatform = clientCapabilityFactory.makeClientPlatform(
      botUserID,
      bridge.getBot().getClient()
    );
    const adminRoom = (
      await loadZeroTouchDeployRoomFromConfig(
        config.adminRoom,
        config.initialManager,
        new BotSDKMatrixAccountData(
          ZERO_TOUCH_DEPLOY_ROOM_ACCOUNT_DATA_TYPE,
          ZeroTouchDeployRoomAccountDataSchema,
          bridge.getBot().getClient()
        ),
        clientPlatform,
        botUserID,
        {
          allowPermalinkForRoomConfig: true,
          configuredRoomPropertyName: "config.adminRoom",
          configuredInitialManagerPropertyName: "config.initialManager",
        }
      )
    ).expect("unable to load the appservice admin room");
    const accessControlRoom = adminRoom;
    const appserviceBotPolicyRoomManager =
      await roomStateManagerFactory.getPolicyRoomManager(botUserID);
    const accessControl = (
      await AccessControl.setupAccessControlForRoom(
        accessControlRoom,
        appserviceBotPolicyRoomManager,
        clientPlatform.toRoomJoiner()
      )
    ).expect("Unable to setup access control for the appservice");
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

    const serverName = config.homeserver.domain;
    const mjolnirManager = await AppServiceDraupnirManager.makeDraupnirManager(
      serverName,
      config.maxDraupnirsPerUser ?? 1,
      dataStore,
      bridge,
      accessControl,
      roomStateManagerFactory,
      stores,
      clientCapabilityFactory,
      clientsInRoomMap,
      clientProvider,
      instanceCountGauge
    );
    const appService = new MjolnirAppService(
      config,
      bridge,
      mjolnirManager,
      accessControl,
      dataStore,
      eventDecoder,
      roomStateManagerFactory,
      clientCapabilityFactory,
      clientsInRoomMap,
      prometheus,
      accessControlRoom.toRoomIDOrAlias(),
      botUserID
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
  public static async run(
    port: number,
    config: AppserviceConfig,
    registrationFilePath: string
  ): Promise<MjolnirAppService> {
    Logger.configure(config.logging ?? { console: "debug" });
    patchMatrixClient();
    const dataStore = new PgDataStore(config.db.connectionString);
    await dataStore.init();
    const eventDecoder = DefaultEventDecoder;
    const storagePath = getStoragePath(config.dataPath);
    const backingStore = config.roomStateBackingStore?.enabled
      ? SqliteRoomStateBackingStore.create(storagePath, eventDecoder)
      : undefined;
    const service = await MjolnirAppService.makeMjolnirAppService(
      config,
      dataStore,
      DefaultEventDecoder,
      registrationFilePath,
      {
        roomStateBackingStore: backingStore,
        dispose() {
          backingStore?.destroy();
        },
      } // we don't support any stores in appservice atm except backing store.
    );
    // The call to `start` MUST happen last. As it needs the datastore, and the mjolnir manager to be initialized before it can process events from the homeserver.
    await service.start(port);
    (
      await MjolnirAppService.ensureAppserviceBotProfile(
        service.bridge,
        service.botUserID
      )
    ).expect("Failed to ensure the appservice bot's profile exists");
    return service;
  }

  public onUserQuery(_queriedUser: MatrixUser) {
    return {}; // auto-provision users with no additonal data
  }

  // Provision a new draupnir for the invitee when the appservice bot (designated by this.bridge.botUserId) is invited to a room.
  // Acts as an alternative to the web api provided for the widget.
  private async handleProvisionInvite(mxEvent: WeakEvent): Promise<void> {
    log.info(
      `${mxEvent.sender} has sent an invitation to the appservice bot ${this.bridge.botUserId}, attempting to provision them a draupnir`
    );
    const client = this.bridge.getBot().getClient();
    try {
      // Join the room so we can notify the requester and then reject the invite.
      try {
        await client.joinRoom(mxEvent.room_id);
      } catch (e: unknown) {
        log.error(
          `Failed to join the room by ${mxEvent.sender} to process provisioning invite`,
          e
        );
        return;
      }

      if (!this.config.allowSelfServiceProvisioning) {
        await client
          .sendText(
            mxEvent.room_id,
            "Self-service provisioning is disabled. Please ask an admin to provision a Draupnir for you."
          )
          .catch((e: unknown) => {
            log.error(
              `Failed to notify ${mxEvent.sender} that self-service provisioning is disabled`,
              e
            );
          });
        return;
      }

      try {
        await client.sendText(
          mxEvent.room_id,
          "Your Draupnir is currently being provisioned. Please wait while we set up the rooms."
        );
      } catch (e: unknown) {
        log.error(
          `Failed to send provisioning welcome flow to ${mxEvent.sender}; aborting provisioning`,
          e
        );
        // We don´t want to continue with provisioning because we don´t have a working communications channel with the user.
        return;
      }
      // Ideallly we need to rework provisionNewDraupnir because its current state does not catch all expected errors.
      let provisioningFailed = false;
      try {
        const provisionResult = await this.draupnirManager.provisionNewDraupnir(
          mxEvent.sender as StringUserID
        );
        if (isError(provisionResult)) {
          log.error(
            `Failed to provision a draupnir for ${mxEvent.sender} after they invited ${this.bridge.botUserId}`,
            provisionResult.error
          );
          provisioningFailed = true;
        }
      } catch (e: unknown) {
        log.error(
          `Failed to provision a draupnir for ${mxEvent.sender} after they invited ${this.bridge.botUserId}`,
          e
        );
        provisioningFailed = true;
      }

      if (provisioningFailed) {
        try {
          await client.sendText(
            mxEvent.room_id,
            "Please make sure you are allowed to provision a bot. Otherwise please notify the admin. The provisioning request was rejected."
          );
        } catch (e: unknown) {
          log.error(
            `Failed to send provisioning failure flow to ${mxEvent.sender}`,
            e
          );
        }
        return;
      }
      // Send a notice that the invite must be accepted.
      try {
        await client.sendText(
          mxEvent.room_id,
          "Please accept the invitations to the newly provisioned rooms. These will be the home of your Draupnir Instance. This room will not be used in the future."
        );
      } catch (e: unknown) {
        log.error(
          `Failed to send provisioning success flow to ${mxEvent.sender}`,
          e
        );
      }
    } finally {
      try {
        // Reject the invite to keep the room clean and make sure the invitee doesn't get confused and think this is their draupnir.
        await client.leaveRoom(mxEvent.room_id);
      } catch (e: unknown) {
        log.warn("Unable to reject an invite to a room", e);
      }
    }
  }

  /**
   * Handle an individual event pushed by the homeserver to us.
   * This function is async (and anything downstream would be anyway), which does mean that events can be processed out of order.
   * Not a huge problem for us, but is something to be aware of.
   * @param request A matrix-appservice-bridge request encapsulating a Matrix event.
   * @param context Additional context for the Matrix event.
   */
  public onEvent(request: Request<WeakEvent>): void {
    const mxEvent = request.getData();
    if ("m.room.member" === mxEvent.type) {
      if ("invite" === mxEvent.content["membership"]) {
        if (mxEvent.room_id === this.accessControlRoomID) {
          // do nothing, setup code should handle this.
        } else if (mxEvent.state_key === this.bridge.botUserId) {
          void Task(this.handleProvisionInvite(mxEvent));
        }
      }
    }
    this.commands.handleEvent(mxEvent);
    const decodeResult = this.eventDecoder.decodeEvent(mxEvent);
    if (isError(decodeResult)) {
      log.error(
        `Got an error when decoding an event for the appservice`,
        decodeResult.error.uuid,
        decodeResult.error
      );
      return;
    }
    const roomID = decodeResult.ok.room_id;
    this.roomStateManagerFactory.handleTimelineEvent(roomID, decodeResult.ok);
    this.clientsInRoomMap.handleTimelineEvent(roomID, decodeResult.ok);
  }

  /**
   * Start the appservice. See `run`.
   * @param port The port that the appservice should listen on to receive transactions from the homeserver.
   */
  private async start(port: number) {
    log.info(
      "Starting DraupnirAppService, Matrix-side to listen on port",
      port
    );
    await this.bridge.listen(port);
    this.prometheusMetrics.addAppServicePath(this.bridge);
    this.bridge.addAppServicePath({
      method: "GET",
      path: "/healthz",
      authenticate: false,
      handler: (_req, res) => {
        res.status(200).send("ok");
      },
    });
    log.info("DraupnirAppService started successfully");
  }

  /**
   * Stop listening to requests from both the homeserver and web api and disconnect from the datastore.
   */
  public async close(): Promise<void> {
    await this.bridge.close();
    await this.dataStore.close();
    this.draupnirManager.unregisterListeners();
  }

  /**
   * Generate a registration file for a fresh deployment of the appservice.
   * Included to satisfy `matrix-appservice-bridge`'s `Cli` utility which allows a registration file to be registered when setting up a deployment of an appservice.
   * @param reg Any existing parameters to be included in the registration, to be mutated by this method.
   * @param callback To call when the registration has been generated with the final registration.
   */
  public static generateRegistration(
    reg: AppServiceRegistration,
    callback: (finalRegistration: AppServiceRegistration) => void
  ) {
    reg.setId(AppServiceRegistration.generateToken());
    reg.setHomeserverToken(AppServiceRegistration.generateToken());
    reg.setAppServiceToken(AppServiceRegistration.generateToken());
    reg.setSenderLocalpart("draupnir-moderation");
    // This is maintained for backwards compatibility with mjolnir4all.
    reg.addRegexPattern("users", "@mjolnir_.*", true);
    reg.addRegexPattern("users", "@draupnir_.*", true);
    reg.setRateLimited(false);
    callback(reg);
  }
}
