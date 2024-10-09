// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import expect from "expect";
import {
  getNonDefaultConfigProperties,
  getUnknownConfigPropertyPaths,
} from "../../../src/config";
import { IConfig } from "../../../src/config";

describe("Test unknown properties detection", () => {
  it("Should detect when there are typos in the config", function () {
    const config = {
      pantalaimon: {
        use: true,
        passweird: "my password hehe",
      },
    };
    const unknownProperties = getUnknownConfigPropertyPaths(config);
    expect(unknownProperties.length).toBe(1);
    expect(unknownProperties[0]).toBe("/pantalaimon/passweird");
  });
});

describe("Test non-default values detection", () => {
  it("Should detect when there are non-default values in the config", function () {
    const config = {
      pantalaimon: {
        use: true,
        password: "my password hehe",
      },
    };
    const differentProperties = getNonDefaultConfigProperties(
      config as IConfig
    ) as unknown as IConfig;
    expect(Object.entries(differentProperties).length).toBe(1);
    expect(differentProperties.pantalaimon.password).toBe("REDACTED");
    expect(differentProperties.pantalaimon.use).toBe(true);
  });
});
