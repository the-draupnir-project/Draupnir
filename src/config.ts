/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019, 2021 The Matrix.org Foundation C.I.C.

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

import * as fs from "fs";
import { load } from "js-yaml";
import { MatrixClient, LogService } from "matrix-bot-sdk";
import Config from "config";
import path from "path";

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
     * If true, Mjolnir will only accept invites from users present in managementRoom.
     * Otherwise a space must be provided to `acceptInvitesFromSpace`.
     */
    autojoinOnlyIfManager: boolean;
    /** Mjolnir will accept invites from members of this space if `autojoinOnlyIfManager` is false. */
    acceptInvitesFromSpace: string;
    recordIgnoredInvites: boolean;
    managementRoom: string;
    verboseLogging: boolean;
    logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
    logMutedModules: string[],
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
    admin?: {
        enableMakeRoomAdminCommand?: boolean;
    }
    commands: {
        allowNoPrefix: boolean;
        additionalPrefixes: string[];
        confirmWildcardBan: boolean;
        features: string[];
        ban: {
            defaultReasons: string[]
        }
    };
    protections: {
        wordlist: {
            words: string[];
            minutesBeforeTrusting: number;
        };
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
        sentry?: {
            dsn: string;

            // Frequency of performance monitoring.
            //
            // A number in [0.0, 1.0], where 0.0 means "don't bother with tracing"
            // and 1.0 means "trace performance at every opportunity".
            tracesSampleRate: number;
        };
    };
    web: {
        enabled: boolean;
        port: number;
        address: string;
        abuseReporting: {
            enabled: boolean;
        }
        ruleServer?: {
            enabled: boolean;
        }
    }
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
    acceptInvitesFromSpace: '!noop:example.org',
    autojoinOnlyIfManager: true,
    recordIgnoredInvites: false,
    managementRoom: "!noop:example.org",
    verboseLogging: false,
    logLevel: "INFO",
    logMutedModules: ['MatrixHttpClient', 'MatrixClientLite'],
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
        features: [
            "synapse admin",
        ],
        ban: {
            defaultReasons: [
                "spam",
                "brigading",
                "harassment",
                "disagreement",
            ]
        }
    },
    protections: {
        wordlist: {
            words: [],
            minutesBeforeTrusting: 20
        }
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
    },
    web: {
        enabled: false,
        port: 8080,
        address: "localhost",
        abuseReporting: {
            enabled: false,
        },
        ruleServer: {
            enabled: false,
        },
    },
    experimentalRustCrypto: false,

    // Needed to make the interface happy.
    RUNTIME: {
    },
};

export function getDefaultConfig(): IConfig {
    return Config.util.cloneDeep(defaultConfig);
}

export function read(): IConfig {
    const explicitConfigPath = getCommandlinePathArgument("--draupnir-config");
    var config;
    if (explicitConfigPath) {
        const content = fs.readFileSync(explicitConfigPath, "utf8");
        const parsed = load(content);
        config = Config.util.extendDeep({}, defaultConfig, parsed);
    } else {
        config = Config.util.extendDeep({}, defaultConfig, Config.util.toObject()) as IConfig;
    }

    // Handle secret files
    if(getCommandlinePathArgument("--access-token-path", true) !== undefined)
        config.accessToken = fs.readFileSync(getCommandlinePathArgument("--access-token-path", true) as string, "utf8");

    if(getCommandlinePathArgument("--pantalaimon-password-path", true) !== undefined)
        config.pantalaimon.password = fs.readFileSync(getCommandlinePathArgument("--pantalaimon-password-path", true) as string, "utf8");

    return config;
}

/**
 * Provides a config for each newly provisioned mjolnir in appservice mode.
 * @param managementRoomId A room that has been created to serve as the mjolnir's management room for the owner.
 * @returns A config that can be directly used by the new mjolnir.
 */
export function getProvisionedMjolnirConfig(managementRoomId: string): IConfig {
    // These are keys that are allowed to be configured for provisioned mjolnirs.
    // We need a restricted set so that someone doesn't accidentally enable webservers etc
    // on every created Mjolnir, which would result in very confusing error messages.
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
    ];
    const configTemplate = read(); // we use the standard bot config as a template for every provisioned mjolnir.
    const unusedKeys = Object.keys(configTemplate).filter(key => !allowedKeys.includes(key));
    if (unusedKeys.length > 0) {
        LogService.warn("config", "The config provided for provisioned mjolnirs contains keys which are not used by the appservice.", unusedKeys);
    }
    const config = Config.util.extendDeep(
        getDefaultConfig(),
        allowedKeys.reduce((existingConfig: any, key: string) => {
            return { ...existingConfig, [key]: configTemplate[key as keyof IConfig] }
        }, {})
    );

    config.managementRoom = managementRoomId;
    config.protectedRooms = [];
    return config;
}

export const PACKAGE_JSON = (() => {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
    } catch (e) {
        LogService.error("config", "Could not read Draupnir package.json", e);
        return {};
    }
})();

export const SOFTWARE_VERSION = (() => {
    let versionFile;
    const defaultText = PACKAGE_JSON.version ?? "A version was either not provided when building Draupnir or could not be read.";
    try {
        versionFile = fs.readFileSync(path.join(__dirname, '../version.txt'), 'utf-8');
    } catch (e) {
        LogService.error("config", "Could not read Draupnir version", e);
        versionFile = defaultText;
    }
    // it's important to ignore the newline if the version is going to be put
    // into <pre> or <code> where it will create an unnecessary newline.
    return /^(.*)$/m.exec(versionFile)?.at(0) ?? defaultText;
})();


// Command line related functions

/**
 * Grabs an argument from the command line and checks if it exists.
 * @param arg Argument name
 * @returns True if the argument is present, otherwise false.
 */
function getCommandlineArgumentPresent(arg: string): boolean {
    return process.argv.includes(arg);
}

/**
 * Grabs an argument's value from program arguments if it exists, otherwise returns undefined.
 * @param arg Argument name
 * @param throwOnInvalid If true or undefined, throws an error if the argument is present but has no value. If false, returns undefined.
 * @returns value passed to the argument or undefined.
 * @throws Error if the argument is present but has no value.
 */
function getCommandlineStringArgument(arg: string, throwOnInvalid?: boolean | undefined): string | undefined {
    // we don't want to throw if the argument is not present
    if(!getCommandlineArgumentPresent(arg)) return undefined;

    const index = process.argv.indexOf(arg);
    if (index === -1) return undefined;
    //check if the next index is not an argument
    if (process.argv[index + 1] && !process.argv[index + 1].startsWith("--"))
        return process.argv[index + 1];
    if (throwOnInvalid === undefined || throwOnInvalid)
        throw new Error(`Invalid value provided for ${arg}`);
    return undefined;
}

/**
 * Grabs a path argument from the command line and checks if it exists.
 * @param arg Argument name
 * @param throwOnInvalid If true or undefined, throws an error if the path does not exist. If false, returns undefined.
 * @returns Path if it exists, otherwise undefined.
 * @throws Error if the path does not exist and throwOnInvalid is true or undefined.
 */
function getCommandlinePathArgument(arg: string, throwOnInvalid?: boolean | undefined): string | undefined {
    // we don't want to throw if the argument is not present
    if(!getCommandlineArgumentPresent(arg)) return undefined;

    const value = getCommandlineStringArgument(arg);
    if (value && fs.existsSync(value)) return value;
    if (throwOnInvalid === undefined || throwOnInvalid)
        throw new Error(`Invalid path provided for ${arg}`);
    return undefined;
}
