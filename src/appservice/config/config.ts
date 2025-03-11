// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import * as fs from "fs";
import { load } from "js-yaml";
import { LoggingOpts } from "matrix-appservice-bridge";

export interface IConfig {
  /** Details for the homeserver the appservice will be serving */
  homeserver: {
    /** The domain of the homeserver that is found at the end of mxids */
    domain: string;
    /** The url to use to acccess the client server api e.g. "https://matrix-client.matrix.org" */
    url: string;
  };
  /** Details for the database backend */
  db: {
    /** Postgres connection string  */
    connectionString: string;
  };
  /** Config for the web api used to access the appservice via the widget */
  webAPI: {
    port: number;
  };
  /** The admin room for the appservice bot. Not called managementRoom like draupnir on purpose, so they're not mixed in code somehow. */
  adminRoom: string;
  /** configuration for matrix-appservice-bridge's Logger */
  logging?: LoggingOpts;

  dataPath: string;

  // Store room state using sqlite to improve startup time when Synapse responds
  // slowly to requests for `/state`.
  roomStateBackingStore: {
    enabled?: boolean;
  };
}

export function read(configPath: string): IConfig {
  const content = fs.readFileSync(configPath, "utf8");
  const parsed = load(content);
  const config = parsed as object as IConfig;
  return config;
}
