// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { ProtectionDescription } from "../../Protection";
import { CapabilityProviderSet } from "../../Capability/CapabilitySet";
import { Result } from "@gnuxie/typescript-result";

export interface ProtectionCapabilityProviderSetConfig {
  /**
   * Return the consequence provider description that has been set for a protection.
   * @param protectionDescription The protection description to find the configured
   * consequence provider description for.
   */
  getCapabilityProviderSet<
    TProtectionDescription extends ProtectionDescription =
      ProtectionDescription,
  >(
    protectionDescription: TProtectionDescription
  ): Promise<Result<CapabilityProviderSet>>;
  storeActivateCapabilityProviderSet(
    protectionDescription: ProtectionDescription,
    capabilityproviderSet: CapabilityProviderSet
  ): Promise<Result<void>>;
}
