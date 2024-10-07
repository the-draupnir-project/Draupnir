// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019, 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import * as fs from "fs";
import { load } from "js-yaml";
import { MatrixClient, LogService } from "matrix-bot-sdk";
import Config from "config";
import path from "path";
import { SafeModeBootOption } from "./safemode/BootOption";
import { Logger } from "matrix-protection-suite";

const log = new Logger("Draupnir config");

/**
 * The version of the configuration that has been explicitly provided,
 * and does not contain default values. Secrets are marked with "REDACTED".
 */
export function getNonDefaultConfigProperties(
  config: IConfig
): Record<string, unknown> {
  const nonDefault = Config.util.diffDeep(defaultConfig, config);
  if ("accessToken" in nonDefault) {
    nonDefault.accessToken = "REDACTED";
  }
  if (
    "pantalaimon" in nonDefault &&
    typeof nonDefault.pantalaimon === "object"
  ) {
    nonDefault.pantalaimon.password = "REDACTED";
  }
  return nonDefault;
}

/**
 * The configuration, as read from production.yaml
 *
 * See file default.yaml for the documentation on individual options.
 */
// The object is magically generated by external lib `config`
// from the file specified by `NODE_ENV`, e.g. production.yaml
// or harness.yaml.
export interface IConfig {
  homeserverUrl: string;
  rawHomeserverUrl: string;
  accessToken: string;
  pantalaimon: {
    use: boolean;
    username: string;
    password: string;
  };
  dataPath: string;
  /**
   * If true, Draupnir will only accept invites from users present in managementRoom.
   * Otherwise a space must be provided to `acceptInvitesFromSpace`.
   */
  autojoinOnlyIfManager: boolean;
  /** Draupnir will accept invites from members of this space if `autojoinOnlyIfManager` is false. */
  acceptInvitesFromSpace: string | undefined;
  recordIgnoredInvites: boolean;
  managementRoom: string;
  verboseLogging: boolean;
  logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
  logMutedModules: string[];
  syncOnStartup: boolean;
  verifyPermissionsOnStartup: boolean;
  disableServerACL: boolean;
  noop: boolean;
  protectedRooms: string[]; // matrix.to urls
  fasterMembershipChecks: boolean;
  automaticallyRedactForReasons: string[]; // case-insensitive globs
  protectAllJoinedRooms: boolean;
  /**
   * Backgrounded tasks: number of milliseconds to wait between the completion
   * of one background task and the start of the next one.
   */
  backgroundDelayMS: number;
  pollReports: boolean;
  /**
   * Whether or not new reports, received either by webapi or polling,
   * should be printed to our managementRoom.
   */
  displayReports: boolean;
  admin?:
    | {
        enableMakeRoomAdminCommand?: boolean;
      }
    | undefined;
  commands: {
    allowNoPrefix: boolean;
    additionalPrefixes: string[];
    confirmWildcardBan: boolean;
    features: string[];
    ban: {
      defaultReasons: string[];
    };
  };
  protections: {
    wordlist: {
      words: string[];
      minutesBeforeTrusting: number;
    };
    newJoinerProtection: {
      serverNames: string[];
      banMessage: string;
    };
    mentionLimitProtection: {
      maxMentions: number;
      redactReason: string;
    };
  };
  safeMode?: {
    bootOption: SafeModeBootOption;
  };
  health: {
    healthz: {
      enabled: boolean;
      port: number;
      address: string;
      endpoint: string;
      healthyStatus: number;
      unhealthyStatus: number;
    };
    // If specified, attempt to upload any crash statistics to sentry.
    sentry?:
      | {
          dsn: string;

          // Frequency of performance monitoring.
          //
          // A number in [0.0, 1.0], where 0.0 means "don't bother with tracing"
          // and 1.0 means "trace performance at every opportunity".
          tracesSampleRate: number;
        }
      | undefined;
  };
  web: {
    enabled: boolean;
    port: number;
    address: string;
    abuseReporting: {
      enabled: boolean;
    };
  };
  // Store room state using sqlite to improve startup time when Synapse responds
  // slowly to requests for `/state`.
  roomStateBackingStore: {
    enabled?: boolean;
  };
  // Experimental usage of the matrix-bot-sdk rust crypto.
  // This can not be used with Pantalaimon.
  experimentalRustCrypto: boolean;

  /**
   * Config options only set at runtime. Try to avoid using the objects
   * here as much as possible.
   */
  RUNTIME: {
    client?: MatrixClient;
  };
}

const defaultConfig: IConfig = {
  homeserverUrl: "http://localhost:8008",
  rawHomeserverUrl: "http://localhost:8008",
  accessToken: "NONE_PROVIDED",
  pantalaimon: {
    use: false,
    username: "",
    password: "",
  },
  dataPath: "/data/storage",
  acceptInvitesFromSpace: "!noop:example.org",
  autojoinOnlyIfManager: true,
  recordIgnoredInvites: false,
  managementRoom: "!noop:example.org",
  verboseLogging: false,
  logLevel: "INFO",
  logMutedModules: ["MatrixHttpClient", "MatrixClientLite"],
  syncOnStartup: true,
  verifyPermissionsOnStartup: true,
  noop: false,
  disableServerACL: false,
  protectedRooms: [],
  fasterMembershipChecks: false,
  automaticallyRedactForReasons: ["spam", "advertising"],
  protectAllJoinedRooms: false,
  backgroundDelayMS: 500,
  pollReports: false,
  displayReports: true,
  commands: {
    allowNoPrefix: false,
    additionalPrefixes: ["draupnir"],
    confirmWildcardBan: true,
    features: ["synapse admin"],
    ban: {
      defaultReasons: ["spam", "brigading", "harassment", "disagreement"],
    },
  },
  protections: {
    wordlist: {
      words: [],
      minutesBeforeTrusting: 20,
    },
    newJoinerProtection: {
      serverNames: [],
      banMessage:
        "Unfortunately we cannot accept new users from your homeserver at this time.",
    },
    mentionLimitProtection: {
      maxMentions: 3,
      redactReason:
        "You have mentioned too many users in this message, so we have had to redact it.",
    },
  },
  safeMode: {
    bootOption: SafeModeBootOption.RecoveryOnly,
  },
  health: {
    healthz: {
      enabled: false,
      port: 8080,
      address: "0.0.0.0",
      endpoint: "/healthz",
      healthyStatus: 200,
      unhealthyStatus: 418,
    },
    sentry: undefined,
  },
  admin: undefined,
  web: {
    enabled: false,
    port: 8080,
    address: "localhost",
    abuseReporting: {
      enabled: false,
    },
  },
  roomStateBackingStore: {
    enabled: false,
  },
  experimentalRustCrypto: false,

  // Needed to make the interface happy.
  RUNTIME: {},
};

export function getDefaultConfig(): IConfig {
  return Config.util.cloneDeep(defaultConfig);
}

/**
 * @returns The users's raw config, deep copied over the `defaultConfig`.
 */
function readConfigSource(): IConfig {
  const explicitConfigPath = getCommandLineOption(
    process.argv,
    "--draupnir-config"
  );
  // we probably want to make an incision after this if block.
  // to create the provided values field to the config.
  const config = (() => {
    if (explicitConfigPath !== undefined) {
      const content = fs.readFileSync(explicitConfigPath, "utf8");
      const parsed = load(content);
      return Config.util.extendDeep({}, defaultConfig, parsed);
    } else {
      return Config.util.extendDeep(
        {},
        defaultConfig,
        Config.util.toObject()
      ) as IConfig;
    }
  })();
  log.info(
    "non-default configuration properties loaded:",
    JSON.stringify(getNonDefaultConfigProperties(config), null, 2)
  );
  const unknownProperties = getUnknownConfigPropertyPaths(config);
  if (unknownProperties.length > 0) {
    log.warn(
      "There are unknown configuration properties, possibly a result of typos:",
      unknownProperties
    );
  }
  return config;
}

export function configRead(): IConfig {
  const config = readConfigSource();
  const explicitAccessTokenPath = getCommandLineOption(
    process.argv,
    "--access-token-path"
  );
  const explicitPantalaimonPasswordPath = getCommandLineOption(
    process.argv,
    "--pantalaimon-password-path"
  );
  if (explicitAccessTokenPath !== undefined) {
    config.accessToken = fs.readFileSync(explicitAccessTokenPath, "utf8");
  }
  if (explicitPantalaimonPasswordPath) {
    config.pantalaimon.password = fs.readFileSync(
      explicitPantalaimonPasswordPath,
      "utf8"
    );
  }
  return config;
}

/**
 * Provides a config for each newly provisioned draupnir in appservice mode.
 * @param managementRoomId A room that has been created to serve as the draupnir's management room for the owner.
 * @returns A config that can be directly used by the new draupnir.
 */
export function getProvisionedMjolnirConfig(managementRoomId: string): IConfig {
  // These are keys that are allowed to be configured for provisioned draupnirs.
  // We need a restricted set so that someone doesn't accidentally enable webservers etc
  // on every created Draupnir, which would result in very confusing error messages.
  const allowedKeys = [
    "commands",
    "verboseLogging",
    "logLevel",
    "syncOnStartup",
    "verifyPermissionsOnStartup",
    "fasterMembershipChecks",
    "automaticallyRedactForReasons",
    "protectAllJoinedRooms",
    "backgroundDelayMS",
    "safeMode",
  ];
  const configTemplate = configRead(); // we use the standard bot config as a template for every provisioned draupnir.
  const unusedKeys = Object.keys(configTemplate).filter(
    (key) => !allowedKeys.includes(key)
  );
  if (unusedKeys.length > 0) {
    LogService.warn(
      "config",
      "The config provided for provisioned draupnirs contains keys which are not used by the appservice.",
      unusedKeys
    );
  }
  const config = Config.util.extendDeep(
    getDefaultConfig(),
    allowedKeys.reduce((existingConfig, key) => {
      return { ...existingConfig, [key]: configTemplate[key as keyof IConfig] };
    }, {})
  );

  config.managementRoom = managementRoomId;
  config.protectedRooms = [];
  return config;
}

export const PACKAGE_JSON = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")
    );
  } catch (e) {
    LogService.error("config", "Could not read Draupnir package.json", e);
    return {};
  }
})();

export const SOFTWARE_VERSION = (() => {
  let versionFile;
  const defaultText =
    PACKAGE_JSON.version ??
    "A version was either not provided when building Draupnir or could not be read.";
  try {
    versionFile = fs.readFileSync(
      path.join(__dirname, "../version.txt"),
      "utf-8"
    );
  } catch (e) {
    LogService.error("config", "Could not read Draupnir version", e);
    versionFile = defaultText;
  }
  // it's important to ignore the newline if the version is going to be put
  // into <pre> or <code> where it will create an unnecessary newline.
  return /^(.*)$/m.exec(versionFile)?.at(0) ?? defaultText;
})();

export const DOCUMENTATION_URL =
  "https://the-draupnir-project.github.io/draupnir-documentation/";

// Command line related functions

/**
 * Grabs an option from the command line and checks if it exists.
 * @param args Program options
 * @param optionName Option name
 * @returns True if the option is present, otherwise false.
 */
function isCommandLineOptionPresent(
  args: string[],
  optionName: string
): boolean {
  return args.includes(optionName);
}

/**
 * Grabs an option's value from program options if it exists, otherwise returns undefined.
 * @param args Program options
 * @param optionName Option name
 * @returns The value passed to the option, or undefined if the option is not specified.
 * @throws Error if the option is present but has no value.
 */
function getCommandLineOption(
  args: string[],
  optionName: string
): string | undefined {
  // We don't want to throw if the option is not present
  if (!isCommandLineOptionPresent(args, optionName)) {
    return undefined;
  }

  const optionIndex = args.indexOf(optionName);

  //check if the next index is not an option
  const associatedArgument = args[optionIndex + 1];
  if (
    associatedArgument !== undefined &&
    !associatedArgument.startsWith("--")
  ) {
    return associatedArgument;
  }

  // No value was provided, or the next argument is another option
  throw new Error(`No value provided for ${optionName}`);
}

type UnknownPropertyPaths = string[];

export function getUnknownPropertiesHelper(
  rawConfig: unknown,
  rawDefaults: unknown,
  currentPathProperties: string[]
): UnknownPropertyPaths {
  const unknownProperties: UnknownPropertyPaths = [];
  if (
    typeof rawConfig !== "object" ||
    rawConfig === null ||
    Array.isArray(rawConfig)
  ) {
    return unknownProperties;
  }
  if (rawDefaults === undefined || rawDefaults == null) {
    // the top level property should have been defined, these could be and
    // probably are custom properties.
    return unknownProperties;
  }
  if (typeof rawDefaults !== "object") {
    throw new TypeError("default and normal config are out of sync");
  }
  const defaultConfig = rawDefaults as Record<string, unknown>;
  const config = rawConfig as Record<string, unknown>;
  for (const key of Object.keys(config)) {
    if (!(key in defaultConfig)) {
      unknownProperties.push("/" + [...currentPathProperties, key].join("/"));
    } else {
      const unknownSubProperties = getUnknownPropertiesHelper(
        config[key],
        defaultConfig[key] as Record<string, unknown>,
        [...currentPathProperties, key]
      );
      unknownProperties.push(...unknownSubProperties);
    }
  }
  return unknownProperties;
}

/**
 * Return a list of JSON paths to properties in the given config object that are not present in the default config.
 * This is used to detect typos in the config file.
 */
export function getUnknownConfigPropertyPaths(config: unknown): string[] {
  if (typeof config !== "object" || config === null) {
    return [];
  }
  return getUnknownPropertiesHelper(
    config,
    defaultConfig as unknown as Record<string, unknown>,
    []
  );
}
