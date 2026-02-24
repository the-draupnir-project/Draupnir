// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok } from "@gnuxie/typescript-result";
import { FakePersistentConfigBackend } from "../../Interface/FakePersistentMatrixData";
import { StandardLoggableConfigTracker } from "../../Interface/LoggableConfig";
import {
  DRAUPNIR_SCHEMA_VERSION_KEY,
  SchemedDataManager,
} from "../../Interface/SchemedMatrixData";
import { MjolnirEnabledProtectionsEvent } from "./MjolnirEnabledProtectionsEvent";
import { MjolnirProtectionsConfig } from "./StandardProtectionsConfig";
import { Value } from "../../Interface/Value";
import "../StandardProtections/MemberBanSynchronisation/MemberBanSynchronisation";
import "../StandardProtections/ServerBanSynchronisation/ServerBanSynchronisation";

test("That the migration handler is applied appropriatley when disabling protections", async function () {
  const protections = [
    "MemberBanSynchronisationProtection",
    "ServerBanSynchronisationProtection",
  ];
  // We need to have the account data fake figured out first
  // Then we need to construct the migration handler with test data
  // Then we need to construct the StandardProtectionsConfig with the migration handler and check the migration was used
  // Then we need to disable some protections put in by the migration handler.
  // Then we need to construct a new migration handler from the same account data fake and test that everything is good.
  const fakeConfigBackend = new FakePersistentConfigBackend({});
  const testMigrationHandler =
    new SchemedDataManager<MjolnirEnabledProtectionsEvent>([
      async (data, toVersion) =>
        Ok({
          enabled: [...data.enabled, protections[0] as string],
          [DRAUPNIR_SCHEMA_VERSION_KEY]: toVersion,
        }),
      async (data, toVersion) =>
        Ok({
          enabled: [...data.enabled, protections[1] as string],
          [DRAUPNIR_SCHEMA_VERSION_KEY]: toVersion,
        }),
    ]);
  const initialProtectionsConfig = (
    await MjolnirProtectionsConfig.create(
      fakeConfigBackend,
      new StandardLoggableConfigTracker(),
      { migrationHandler: testMigrationHandler }
    )
  ).expect("Should be able to create the enabled protections");
  expect(initialProtectionsConfig.getKnownEnabledProtections().length).toBe(2);
  (
    await initialProtectionsConfig.disableProtection(protections[1] as string)
  ).expect("Should be able to disable protections");
  const postDisableProtections = Value.Decode(
    MjolnirEnabledProtectionsEvent,
    (await fakeConfigBackend.requestUnparsedConfig()).expect(
      "Should be able to get the fake account data"
    )
  ).expect("Should be able to decode the fake account data");
  expect(postDisableProtections.enabled.length).toBe(1);
  expect(postDisableProtections[DRAUPNIR_SCHEMA_VERSION_KEY]).toBe(2);
});
