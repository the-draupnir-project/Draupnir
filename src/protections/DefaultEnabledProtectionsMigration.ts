/**
 * Copyright (C) 2023-2024 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionError,DRAUPNIR_SCHEMA_VERSION_KEY, MjolnirEnabledProtectionsEvent, MjolnirEnabledProtectionsEventType, Ok, SchemedDataManager, Value } from "matrix-protection-suite";

export const DefaultEnabledProtectionsMigration = new SchemedDataManager<MjolnirEnabledProtectionsEvent>([
  async function enableBanPropagationByDefault(input) {
    if (!Value.Check(MjolnirEnabledProtectionsEvent, input)) {
      return ActionError.Result(
        `The data for ${MjolnirEnabledProtectionsEventType} is corrupted.`
      );
    }
    const enabled = new Set(input.enabled);
    enabled.add('BanPropagationProtection');
    return Ok({
      enabled: [...enabled],
      [DRAUPNIR_SCHEMA_VERSION_KEY]: 1,
    });
  },
]);
