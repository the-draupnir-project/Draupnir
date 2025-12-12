// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import expect from "expect";
import { serverBanSynchronisationCapabilityRename } from "../../../src/protections/ConfigMigration/CapabilitySetProviderMigration";
import {
  CapabilityProviderConfig,
  DRAUPNIR_SCHEMA_VERSION_KEY,
  Ok,
  SemanticType,
  ServerACLSynchronisationCapability,
  SimulatedServerBanSynchronisationCapability,
} from "matrix-protection-suite";

const serverBanSynchronisationCapabilityRenameSemanticType = SemanticType<
  typeof serverBanSynchronisationCapabilityRename
>("serverBanSynchronisationCapabilityRename").Law({
  updateSimulatedServerConsequences: {
    what: "Renames SimulatedServerConsequences to SimulatedServerBanSynchronisationCapability",
    why: "The capability is now specific to the server ban synchronisation protection.",
    law: "When given a CapabilityProviderConfig with SimulatedServerConsequences, the migration should return a config with SimulatedServerBanSynchronisationCapability.",
    async check(makeSubject) {
      const migration = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const input = {
        serverConsequences: {
          capability_provider_name: "SimulatedServerConsequences",
        },
      } as unknown as CapabilityProviderConfig;
      const toVersion = 1;
      const output = (await migration(input, toVersion)).expect(
        "Migration should succeed for SimulatedServerConsequences"
      );
      expect(
        output.ServerBanSynchronisationCapability?.capability_provider_name
      ).toBe(SimulatedServerBanSynchronisationCapability.name);
      expect(
        (output as Record<string, unknown>).ServerConsequences
      ).toBeUndefined();
    },
  },
  updateServerACLConsequences: {
    what: "Renames ServerACLConsequences to ServerACLSynchronisationCapability",
    why: "The capability is now specific to the server ACL synchronisation protection.",
    law: "When given a CapabilityProviderConfig with ServerACLConsequences, the migration should return a config with ServerACLSynchronisationCapability.",
    async check(makeSubject) {
      const migration = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const input = {
        serverConsequences: {
          capability_provider_name: "ServerACLConsequences",
        },
      } as unknown as CapabilityProviderConfig;
      const toVersion = 1;
      const output = (await migration(input, toVersion)).expect(
        "Migration should succeed for ServerACLConsequences"
      );

      expect(output[DRAUPNIR_SCHEMA_VERSION_KEY]).toBe(toVersion);
      expect(
        output.ServerBanSynchronisationCapability?.capability_provider_name
      ).toBe(ServerACLSynchronisationCapability.name);
      expect(
        (output as Record<string, unknown>).ServerConsequences
      ).toBeUndefined();
    },
  },
  maintainOtherConfigs: {
    what: "Capability providers for other protections are not changed by the migration",
    why: "The migration only changes the capability provider for the server ban synchronisation protection",
    law: "When given a CapabilityProviderConfig without SimulatedServerConsequences or ServerACLConsequences, the migration should return the same config with an updated schema version.",
    async check(makeSubject) {
      const migration = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const input = {
        SomeOtherCapability: {
          capability_provider_name: "SomeOtherProvider",
        },
      } as unknown as CapabilityProviderConfig;
      const toVersion = 1;
      const output = (await migration(input, toVersion)).expect(
        "Migration should succeed when there is no ServerConsequences entry"
      );

      expect(output[DRAUPNIR_SCHEMA_VERSION_KEY]).toBe(toVersion);
      expect(output.SomeOtherCapability?.capability_provider_name).toBe(
        "SomeOtherProvider"
      );
      expect(
        (output as Record<string, unknown>).ServerBanSynchronisationCapability
      ).toBeUndefined();
    },
  },
  errorsOnOtherProiders: {
    what: "When an unknown capability provider is found for the server ban synchronisation protection, there's an error",
    why: "To avoid silent failures when a custom capability provider is used",
    law: "When given a CapabilityProviderConfig with an unknown capability provider for the server ban synchronisation protection, the migration should throw a TypeError.",
    async check(makeSubject) {
      const migration = (await makeSubject()).expect(
        "Should be able to make the subject"
      );
      const input = {
        serverConsequences: {
          capability_provider_name: "CustomServerConsequences",
        },
      } as unknown as CapabilityProviderConfig;
      const toVersion = 1;

      let caught: unknown;
      try {
        await migration(input, toVersion);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(TypeError);
    },
  },
});

it("serverBanSynchronisationCapabilityRename satisfies its semantic type", async () => {
  await serverBanSynchronisationCapabilityRenameSemanticType.check(async () =>
    Ok(serverBanSynchronisationCapabilityRename)
  );
});
