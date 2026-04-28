// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import { StringUserIDSchema } from "../MatrixTypes/StringlyTypedMatrix";
import { describeConfig } from "./describeConfig";
import { isOk } from "@gnuxie/typescript-result";
import { StandardConfigMirror } from "./ConfigMirror";
import { ConfigErrorDiagnosis } from "./ConfigParseError";

const TrustedReportersConfigDescription = describeConfig({
  schema: Type.Object(
    {
      mxids: Type.Array(StringUserIDSchema, { default: [], uniqueItems: true }),
      alertThreshold: Type.Number({ default: -1 }),
    },
    { additionalProperties: false }
  ),
});
it("Works i guess", function () {
  expect(
    TrustedReportersConfigDescription.parseConfig({
      mxids: ["@example:localhost"],
      alertThreshold: 5,
    }).isOkay
  ).toBe(true);
  const result = TrustedReportersConfigDescription.parseConfig({
    mxids: [":something that makes no sense"],
  });
  if (isOk(result)) {
    throw new Error("Expected this to fail");
  }
  expect(result.error.errors.length).toBe(1);
  expect(result.error.errors[0]?.path).toBe("/mxids/0");
  expect(TrustedReportersConfigDescription.properties().length).toBe(2);
});

it("Is possible to create a mirror about a config", function () {
  const config = TrustedReportersConfigDescription.parseConfig({
    mxids: ["@example:localhost"],
  }).expect("Config should have parsed");
  const mirror = new StandardConfigMirror(TrustedReportersConfigDescription);
  const newConfig = mirror
    .addItem(config, "mxids", "@alice:localhost")
    .expect("Should have added");
  expect(newConfig.mxids.length).toBe(2);
});

it("Is possible to get validation errors for adding garbage values", function () {
  const config = TrustedReportersConfigDescription.parseConfig({
    mxids: ["@example:localhost"],
  }).expect("Config should have parsed");
  const mirror = new StandardConfigMirror(TrustedReportersConfigDescription);
  const result = mirror.addItem(config, "mxids", "garbage hehe");
  if (isOk(result)) {
    throw new Error("Expected this to fail");
  }
  expect(result.error.path).toBe("/mxids/1");
  expect(result.error.diagnosis).toBe(
    ConfigErrorDiagnosis.ProblematicArrayItem
  );
});

it("Is possible to get correct paths from wrong values", function () {
  const config = TrustedReportersConfigDescription.parseConfig({
    mxids: ["@example:localhost"],
  }).expect("Config should have parsed");
  const numberResult = TrustedReportersConfigDescription.toMirror().setValue(
    config,
    "alertThreshold",
    "not a number"
  );
  if (isOk(numberResult)) {
    throw new Error("Expected this to fail");
  }
  expect(numberResult.error.path).toBe("/alertThreshold");
});

it("Gives us accurate information on arrays being replaced with non-arrays, and that the config is recoverable", function () {
  const result = TrustedReportersConfigDescription.parseConfig({
    mxids: "cheese wheels",
  });
  if (isOk(result)) {
    throw new Error("Expected this to fail");
  }
  expect(result.error.errors[0]?.diagnosis).toBe(
    ConfigErrorDiagnosis.ProblematicValue
  );
});

it("What happens when we just provide the completely wrong config", function () {
  const config = {
    oranges: ["moldy"],
    apples: 5,
  };
  const result = TrustedReportersConfigDescription.parseConfig(config);
  if (isOk(result)) {
    throw new Error("Expected this to fail");
  }
});
