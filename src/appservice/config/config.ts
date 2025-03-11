// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Type } from "@sinclair/typebox";
import * as fs from "fs";
import { load } from "js-yaml";
import { Value } from "@sinclair/typebox/value";
import { EDStatic } from "matrix-protection-suite";

export function read(configPath: string): AppserviceConfig {
  const content = fs.readFileSync(configPath, "utf8");
  const jsonParsed = load(content);
  const decodedConfig = Value.Decode(AppserviceConfig, jsonParsed);
  return decodedConfig;
}

export const LoggingOptsSchema = Type.Object({
  console: Type.Optional(
    Type.Union(
      [
        Type.Literal("debug"),
        Type.Literal("info"),
        Type.Literal("warn"),
        Type.Literal("error"),
        Type.Literal("trace"),
        Type.Literal("off"),
      ],
      { description: "The log level used by the console output." }
    )
  ),
  json: Type.Optional(
    Type.Boolean({
      description:
        "Should the logs be outputted in JSON format, for consumption by a collector.",
    })
  ),
  colorize: Type.Optional(
    Type.Boolean({
      description:
        "Should the logs color-code the level strings in the output.",
    })
  ),
  timestampFormat: Type.Optional(
    Type.String({
      description: "Timestamp format used in the log output.",
      default: "HH:mm:ss:SSS",
    })
  ),
});

export type AppserviceConfig = EDStatic<typeof AppserviceConfig>;
export const AppserviceConfig = Type.Object({
  homeserver: Type.Object(
    {
      domain: Type.String({
        description:
          "The domain of the homeserver that is found at the end of mxids",
      }),
      url: Type.String({
        description:
          "The url to use to access the client server api e.g. 'https://matrix-client.matrix.org'",
      }),
    },
    {
      description: "Details for the homeserver the appservice will be serving ",
    }
  ),
  db: Type.Object(
    {
      connectionString: Type.String({
        description: "Postgres connection string",
      }),
    },
    { description: "Details for the database backend" }
  ),
  webAPI: Type.Object(
    {
      port: Type.Number({
        description:
          "Port number for the web API used to access the appservice via the widget",
      }),
    },
    {
      description:
        "Config for the web api used to access the appservice via the widget",
    }
  ),
  adminRoom: Type.String({
    description:
      "The admin room for the appservice bot. Not called managementRoom like draupnir on purpose, so they're not mixed in code somehow.",
  }),
  roomStateBackingStore: Type.Optional(
    Type.Object(
      {
        enabled: Type.Boolean(),
      },
      {
        description:
          "Store room state using sqlite to improve startup time when Synapse responds slowly to requests for `/state`.",
      }
    )
  ),
  dataPath: Type.String({
    description:
      "A directory where the appservice can storestore persistent data.",
    default: "/data/storage",
  }),
  logging: Type.Optional(LoggingOptsSchema),
});
