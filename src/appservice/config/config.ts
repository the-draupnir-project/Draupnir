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
  /** The admin room for the appservice bot. Not called managementRoom like mjolnir on purpose, so they're not mixed in code somehow. */
  adminRoom: string;
  /** configuration for matrix-appservice-bridge's Logger */
  logging?: LoggingOpts;
}

export function read(configPath: string): IConfig {
  const content = fs.readFileSync(configPath, "utf8");
  const parsed = load(content);
  const config = parsed as object as IConfig;
  return config;
}
