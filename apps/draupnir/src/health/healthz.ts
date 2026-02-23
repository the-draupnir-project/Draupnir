// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import * as http from "http";
import { LogService } from "matrix-bot-sdk";
import { IConfig } from "../config";
// allowed to use the global configuration since this is only intended to be used by `src/index.ts`.

export class Healthz {
  private healthCode: number;

  constructor(private config: IConfig) {
    this.healthCode = this.config.health.healthz.unhealthyStatus;
  }

  public set isHealthy(val: boolean) {
    this.healthCode = val
      ? this.config.health.healthz.healthyStatus
      : this.config.health.healthz.unhealthyStatus;
  }

  public get isHealthy(): boolean {
    return this.healthCode === this.config.health.healthz.healthyStatus;
  }

  public listen() {
    const server = http.createServer((req, res) => {
      res.writeHead(this.healthCode);
      res.end(`health code: ${this.healthCode}`);
    });
    server.listen(
      this.config.health.healthz.port,
      this.config.health.healthz.address,
      () => {
        LogService.info(
          "Healthz",
          `Listening for health requests on ${this.config.health.healthz.address}:${this.config.health.healthz.port}`
        );
      }
    );
  }
}
