// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Cli } from "matrix-appservice-bridge";
import { MjolnirAppService } from "./AppService";
import { AppserviceConfig } from "./config/config";
import { Value } from "@sinclair/typebox/value";

/**
 * This file provides the entrypoint for the appservice mode for draupnir.
 * A registration file can be generated `ts-node src/appservice/cli.ts -r -u "http://host.docker.internal:9000"`
 * and the appservice can be started with `ts-node src/appservice/cli -p 9000 -c your-config.yaml`.
 */
const cli = new Cli({
  registrationPath: "draupnir-registration.yaml",
  bridgeConfig: {
    schema: {},
    affectsRegistration: false,
    defaults: {},
  },
  generateRegistration: MjolnirAppService.generateRegistration,
  run: function (port: number) {
    const config = cli.getConfig();
    if (config === null) {
      throw new Error("Couldn't load config");
    }
    void MjolnirAppService.run(
      port,
      // we use the matrix-appservice-bridge library to handle cli arguments for loading the config
      // but we have to still validate it ourselves.
      Value.Decode(AppserviceConfig, config),
      cli.getRegistrationFilePath()
    );
  },
});

cli.run();
