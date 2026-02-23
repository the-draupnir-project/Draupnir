// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ActionResult,
  Ok,
  ProtectionsConfig,
  ServerBanSynchronisationProtection,
  isError,
} from "matrix-protection-suite";
import { IConfig } from "../config";
import { RoomTakedownProtection } from "./RoomTakedown/RoomTakedownProtection";
import { BlockInvitationsOnServerProtection } from "./BlockInvitationsOnServerProtection";

type ConfigHook = (
  config: IConfig,
  protectionsConfig: ProtectionsConfig
) => Promise<ActionResult<void>>;

export const ServerAdminProtections = [
  RoomTakedownProtection,
  BlockInvitationsOnServerProtection,
];

const hooks: ConfigHook[] = [
  async function disableServerACL(config, protectionsConfig) {
    if (config.disableServerACL) {
      return await protectionsConfig.disableProtection(
        ServerBanSynchronisationProtection.name
      );
    } else {
      return Ok(undefined);
    }
  },
];

/**
 * Introduced to allow the legacy option `config.disableServerACL` to map onto
 * MPS's ServerBanSynchronisationProtection. I think we need to deprecate the
 * option and offer something else.
 */
export async function runProtectionConfigHooks(
  config: IConfig,
  protectionsConfig: ProtectionsConfig
): Promise<ActionResult<void>> {
  for (const hook of hooks) {
    const result = await hook(config, protectionsConfig);
    if (isError(result)) {
      return result;
    }
  }
  return Ok(undefined);
}
