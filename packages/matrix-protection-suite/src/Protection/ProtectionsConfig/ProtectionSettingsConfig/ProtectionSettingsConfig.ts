// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { TObject } from "@sinclair/typebox";
import { ProtectionDescription } from "../../Protection";
import { Result } from "@gnuxie/typescript-result";
import { UnknownConfig } from "../../../Config/ConfigDescription";
import { EDStatic } from "../../../Interface/Static";

export interface ProtectionSettingsConfig {
  // FIXME: replace TConfigSchema with TProtectionDescription and destructure the ConfigSchema to return from there.
  getProtectionSettings<TConfigSchema extends TObject = UnknownConfig>(
    protectionDescription: ProtectionDescription
  ): Promise<Result<EDStatic<TConfigSchema>>>;

  storeProtectionSettings(
    protectionDescription: ProtectionDescription,
    settings: Record<string, unknown>
  ): Promise<Result<void>>;
}
