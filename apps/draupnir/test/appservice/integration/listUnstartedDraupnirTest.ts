// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import expect from "expect";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { setupHarness } from "../utils/harness";
import { isError } from "matrix-protection-suite";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

interface Context extends Mocha.Context {
  appservice?: MjolnirAppService;
}

describe("Just test some commands innit", function () {
  beforeEach(async function (this: Context) {
    this.appservice = await setupHarness();
  });
  afterEach(function (this: Context) {
    if (this.appservice) {
      return this.appservice.close();
    } else {
      console.warn("Missing Appservice in this context, so cannot stop it.");
      return Promise.resolve(); // TS7030: Not all code paths return a value.
    }
  });
  it("Can list any unstarted draupnir", async function (this: Context) {
    const appservice = this.appservice;
    if (appservice === undefined) {
      throw new TypeError(`Test setup failed`);
    }
    const result = await appservice.commands.sendTextCommand(
      "@test:localhost:9999" as StringUserID,
      "!admin list unstarted"
    );
    if (isError(result)) {
      throw new TypeError(`Command should have succeeded`);
    }
    expect(result.ok).toBeInstanceOf(Array);
  });
});
