// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
// SPDX-FileCopyrightText: 2019 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Type } from "@sinclair/typebox";
import { EDStatic, Permalink, StringRoomAlias, StringRoomID } from "matrix-protection-suite";

const PantalaimonConfig = Type.Object({
    use: Type.Boolean({
        description: "Whether or not Draupnir will use pantalaimon to access the matrix homeserver,\
        set to `true` if you're using pantalaimon.\
        Be sure to point homeserverUrl to the pantalaimon instance.\
        Draupnir will log in using the given username and password once,\
        then store the resulting access token in a file under dataPath.",
    }),
    username: Type.String({
        description: "The username for Draupnir to log into Pantalaimon with."
    }),
    password: Type.String({
        description: "The password Draupnir will log into Pantalaimon with.\
        After successfully logging in once, this will be ignored, so this value can be blanked after the first startup.\
        This option can be loaded from a file by passing \"--pantalaimon-password-path <path>\" at the command line,\
        which would allow using secret management systems such as systemd's service credentials."
    }),
}, {
    description: "Options related to Pantalaimon (https://github.com/matrix-org/pantalaimon)"
});

const AdminConfig = Type.Object({
    enableMakeRoomAdminCommand: Type.Boolean({
        description: `Whether or not Draupnir can temporarily take control of any eligible account from the local homeserver who's in the room
        (with enough permissions) to "make" a user an admin.

        This only works if a local user with enough admin permissions is present in the room.`
    })
}, {
    description: `Server administration commands, these commands will only work if Draupnir is
    a global server administrator, and the bot's server is a Synapse instance.`
});

const BanCommandConfig = Type.Object({
    defaultReasons: Type.Array(Type.String(), {
        description: "The default reasons to be prompted with if the reason is missing from a ban command."
    })
}, {
    description: "Options for the ban command."
});

const WordlistProtectionConfig = Type.Object({
    words: Type.Array(Type.String(), {
        description: `A list of case-insensitive keywords that the WordList protection will watch for from new users.

        WordList will ban users who use these words when first joining a room, so take caution when selecting them.

        For advanced usage, regex can also be used, see the following links for more information;
        - https://www.digitalocean.com/community/tutorials/an-introduction-to-regular-expressions
        - https://regexr.com/
        - https://regexone.com/`
    }),
    minutesBeforeTrusting: Type.Number({
        description: `For how long (in minutes) the user is "new" to the WordList plugin.

        After this time, the user will no longer be banned for using a word in the above wordlist.

        Set to zero to disable the timeout and make users *always* appear "new".
        (users will always be banned if they say a bad word)`
    })
}, {
    description: `Configuration for the wordlist plugin, which can ban users based if they say certain
    blocked words shortly after joining.`
})

const ProtectionsConfig = Type.Object({
    wordlist: WordlistProtectionConfig
})

const CommandsConfig = Type.Object({
    // FIXME: Does this even do anything anymore?
    allowNoPrefix: Type.Boolean({
        description: `Whether or not the \`!draupnir\` prefix is necessary to submit commands.

        If \`true\`, will allow commands like \`!ban\`, \`!help\`, etc.

        Note: Draupnir can also be pinged by display name instead of having to use
        the !draupnir prefix. For example, "my_moderator_bot: ban @spammer:example.org"
        will address only my_moderator_bot.`
    }),
    additionalPrefixes: Type.Array(Type.String(), {
        description: "Any additional bot prefixes that Draupnir will listen to. i.e. adding `mod` will allow `!mod help`."
    }),
    confirmWildcardBan: Type.Boolean({
        description: `Whether or not commands with a wildcard (*) will require an additional \`--force\` argument
        in the command to be able to be submitted.`
    }),
    ban: BanCommandConfig,
}, {
    description: "Misc options for command handling and commands"
});

const RoomStateBackingStoreConfig = Type.Object({
    enabled: Type.Boolean(),
},
{
    description: `The room state backing store writes a copy of the room state for all protected
    rooms to the data directory.
    It is recommended to enable this option unless you deploy Draupnir close to the
    homeserver and know that Draupnir is starting up quickly. If your homeserver can
    respond quickly to Draupnir's requests for \`/state\` then you might not need this option.`
});

const HealthzConfig = Type.Object({
    enabled: Type.Boolean({
        description: "Whether the healthz integration should be enabled (default false)",
    }),
    port: Type.Integer({
        description: "The port to expose the webserver on. Defaults to 8080.",
    }),
    address: Type.String({
        description: "The address to listen for requests on. Defaults to all addresses."
    }),
    endpoint: Type.String({
        description: "The path to expose the monitoring endpoint at. Defaults to `/healthz`"
    }),
    healthyStatus: Type.Integer({
        description: `The HTTP status code which reports that the bot is healthy/ready to
        process requests. Typically this should not be changed. Defaults to 200.`
    }),
    unhealthyStatus: Type.Integer({
        description: `The HTTP status code which reports that the bot is not healthy/ready.
        Defaults to 418.`
    }),
}, {
    description: `healthz options. These options are best for use in container environments
    like Kubernetes to detect how healthy the service is. The bot will report
    that it is unhealthy until it is able to process user requests. Typically
    this means that it'll flag itself as unhealthy for a number of minutes
    before saying "Now monitoring rooms" and flagging itself healthy.".`
});

const SentryConfig = Type.Object({
    dsn: Type.String({
        description: `The key used to upload Sentry data to the server.
        dsn: "https://XXXXXXXXX@example.com/YYY`
    }),
    tracesSampleRate: Type.Number({
        description: `Frequency of performance monitoring.
        A number in [0.0, 1.0], where 0.0 means "don't bother with tracing"
        and 1.0 means "trace performance at every opportunity".`
    })
}, {
    description: `Sentry options. Sentry is a tool used to receive/collate/triage runtime
    errors and performance issues. Skip this section if you do not wish to use Sentry.`,
})

const HealthConfig = Type.Object({
    healthz: HealthzConfig,
    sentry: Type.Optional(Type.Union([SentryConfig, Type.Null()])),
}, {
    description: "Options for advanced monitoring of the health of the bot."
})

const AbuseReportingConfig = Type.Object({
    enabled: Type.Boolean({
        description: "Whether to enable the abuse reporting feature."
    })
}, {
    description: `A web API designed to intercept Matrix API
    POST /_matrix/client/r0/rooms/{roomId}/report/{eventId}
    and display readable abuse reports in the moderation room.

    If you wish to take advantage of this feature, you will need
    to configure a reverse proxy, see e.g. test/nginx.conf`
})

const WebConfig = Type.Object({
    enabled: Type.Boolean({
        description: "Whether to enable web APIs.",
    }),
    port: Type.Integer({
        description: "The port to expose the webserver on. Defaults to 8080."
    }),
    address: Type.String({
        description: "The address to listen for requests on. Defaults to only the current computer."
    }),
    abuseReporting: AbuseReportingConfig,

}, {
    description: "Options for exposing web APIs."
})

// FIXME: Would be nice if MPS had a transform for MatrixRoomReferences
export const ConfigSchema = Type.Object({
    homeserverUrl: Type.String({
        // I hate this? does matrix-bot-sdk know to use well knoen? what's going on here
        description: "The URL to connect to the client server API with, this could be Pantalaimon."
    }),
    rawHomeserverUrl: Type.String({
        description: "The publical facing URL client server API and /_synapse/ are served under, note that this must not be the URL for Pantalaimon"
    }),
    accessToken: Type.String({
        description: `
        A Matrix access token for the Matrix user to authenticate with.
        Draupnir will only use this if pantalaimon.use is false.
        This option can be loaded from a file by passing "--access-token-path <path>" at the command line,
        which would allow using secret management systems such as systemd's service credentials.`,
    }),
    pantalaimon: PantalaimonConfig,
    experimentalRustCrypto: Type.Boolean({
        description: "\
        Experimental usage of the matrix-bot-sdk rust crypto.\
        This can not be used with Pantalaimon.\
        Make sure to setup the bot as if you are NOT using pantalaimon for this.\
        Warning: At this time this is not considered production safe."
    }),
    dataPath: Type.String({
        description: 'The path Draupnir will store its state/data in, leave default ("/data/storage") when using containers.'
    }),
    autojoinOnlyIfManager: Type.Boolean({
        description: "If true (the default), Draupnir will only accept invites from users present in managementRoom."
    }),
    acceptInvitesFromSpace: Type.Union([Permalink, StringRoomID, StringRoomAlias], {
        description: "If `autojoinOnlyIfManager` is false, only the members in this space can invite the bot to protect new rooms."
    }),
    recordIgnoredInvites: Type.Boolean({
        description: "Whether Draupnir should report ignored invites to the management room (if autojoinOnlyIfManager is true)."
    }),
    managementRoom: Type.Union([Permalink, StringRoomID, StringRoomAlias], {
        description: "The room ID (or room alias) of the management room, anyone in this room can issue commands to Draupnir.\
        Draupnir has no more granular access controls other than this, be sure you trust everyone in this room - secure it!\
        This should be a room alias or room ID - not a matrix.to URL.\
        Note: By default, Draupnir is fairly verbose - expect a lot of messages in this room.\
        (see verboseLogging to adjust this a bit.)"
    }),
    logLevel: Type.Union([
        Type.Literal("DEBUG"),
        Type.Literal("INFO"),
        Type.Literal("WARN"),
        Type.Literal("ERROR")
    ],
    {
        description: "The log level of terminal (or container) output,\
        can be one of DEBUG, INFO, WARN and ERROR, in increasing order of importance and severity.\
        This should set to INFO or DEBUG in order to get support for Draupnir issues."
    }),
    logMutedModules: Type.Array(Type.String(), {
        description: "Modules to mute in the log output"
    }),
    noop: Type.Boolean({
        description: "Whether or not Draupnir should actually apply bans and policy lists,\
        turn on to trial some untrusted configuration or lists."
    }),
    disableServerACL: Type.Boolean({
        description: "# Whether or not Draupnir should apply `m.room.server_acl` events.\
        DO NOT change this to `true` unless you are very confident that you know what you are doing."
    }),
    automaticallyRedactForReasons: Type.Array(Type.String(), {
        description: `A case-insensitive list of ban reasons to have the bot also automatically redact the user's messages for.

        If the bot sees you ban a user with a reason that is an (exact case-insensitive) match to this list,
        it will also remove the user's messages automatically.
        #
        Typically this is useful to avoid having to give two commands to the bot.
        Advanced: Use asterisks to have the reason match using "globs"
        (f.e. "spam*testing" would match "spam for testing" as well as "spamtesting").

        See here for more info: https://www.digitalocean.com/community/tools/glob
        Note: Keep in mind that glob is NOT regex!`
    }),
    protectAllJoinedRooms: Type.Boolean({
        description: `Whether or not to add all joined rooms to the "protected rooms" list
        (excluding the management room and watched policy list rooms, see below).

        Note that this effectively makes the protectedRooms and associated commands useless
        for regular rooms.

        Note: the management room is *excluded* from this condition.
        Explicitly add it as a protected room to protect it.

        Note: Ban list rooms the bot is watching but didn't create will not be protected.
        Explicitly add these rooms as a protected room list if you want them protected.`
    }),
    backgroundDelayMS: Type.Integer({
        description: `Increase this delay to have Draupnir wait longer between two consecutive backgrounded
        operations. The total duration of operations will be longer, but the homeserver won't
        be affected as much. Conversely, decrease this delay to have Draupnir chain operations
        faster. The total duration of operations will generally be shorter, but the performance
        of the homeserver may be more impacted.`
    }),
    pollReports: Type.Boolean({
        description: `Whether or not to actively poll synapse for abuse reports, to be used
        instead of intercepting client calls to synapse's abuse endpoint, when that
        isn't possible/practical.`
    }),
    displayReports: Type.Boolean({
        description: `Whether or not new reports, received either by webapi or polling,
        should be printed to our managementRoom.`
    }),
    admin: Type.Optional(AdminConfig),
    commands: CommandsConfig,
    protections: ProtectionsConfig,
    roomStateBackingStore: RoomStateBackingStoreConfig,
    health: HealthConfig,
    web: WebConfig,
});
// eslint-disable-next-line no-redeclare
export type ConfigSchema = EDStatic<typeof ConfigSchema>;
