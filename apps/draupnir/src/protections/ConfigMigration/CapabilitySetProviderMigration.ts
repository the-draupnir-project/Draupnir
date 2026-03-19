// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, ResultError } from "@gnuxie/typescript-result";
import {
  CapabilityProviderConfig,
  DRAUPNIR_SCHEMA_VERSION_KEY,
  Logger,
  SchemedDataManager,
  ServerACLSynchronisationCapability,
  SimulatedServerBanSynchronisationCapability,
  Value,
} from "matrix-protection-suite";

const log = new Logger("CapabilitySetProviderMigration");

export async function serverBanSynchronisationCapabilityRename(
  input: CapabilityProviderConfig,
  toVersion: number
) {
  // Annoyingly, having a record type on the top level mixed with known
  // properties is really terrible for typescript to deal with.
  if (!Value.Check(CapabilityProviderConfig, input)) {
    return ResultError.Result(
      `The data for the capability provider config is corrupted.`
    );
  }
  const protectionCapabilityName = "serverConsequences";
  const oldSimulatedServerConsequencesName = "SimulatedServerConsequences";
  const oldServerACLConsequencesName = "ServerACLConsequences";
  const oldServerConsequencesSet = input[protectionCapabilityName];
  if (oldServerConsequencesSet === undefined) {
    return Ok({
      ...input,
      [DRAUPNIR_SCHEMA_VERSION_KEY]: toVersion,
    } as unknown as CapabilityProviderConfig);
  }
  log.debug(
    `Migrating capability provider from ${protectionCapabilityName} to ServerBanSynchronisationCapability`
  );
  const makeProviderSet = (
    capabilityName: string
  ): CapabilityProviderConfig => {
    return {
      [protectionCapabilityName]: {
        capability_provider_name: capabilityName,
      },
      [DRAUPNIR_SCHEMA_VERSION_KEY]: toVersion,
    } as unknown as CapabilityProviderConfig;
  };
  switch (oldServerConsequencesSet.capability_provider_name) {
    case oldSimulatedServerConsequencesName:
      return Ok(
        makeProviderSet(SimulatedServerBanSynchronisationCapability.name)
      );
    case oldServerACLConsequencesName:
      return Ok(makeProviderSet(ServerACLSynchronisationCapability.name));
    default:
      // if someone has written their own custom thing, they probably need to know that we've
      // change the interface name.
      throw new TypeError(
        `Unknown capability provider name: ${oldServerConsequencesSet.capability_provider_name}`
      );
  }
}

export const CapabilitySetProviderMigration =
  new SchemedDataManager<CapabilityProviderConfig>([
    serverBanSynchronisationCapabilityRename,
  ]);
