// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { describeCommand } from "@the-draupnir-project/interface-manager";
import { SafeModeDraupnir } from "../safemode/DraupnirSafeMode";
import { Result } from "@gnuxie/typescript-result";
import { Draupnir } from "../Draupnir";
import { SafeModeReason } from "../safemode/SafeModeCause";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirSafeModeCommand = describeCommand({
  summary: "Enter into safe mode.",
  parameters: [],
  async executor({
    safeModeToggle,
  }: Draupnir): Promise<Result<SafeModeDraupnir>> {
    return safeModeToggle.switchToSafeMode({
      reason: SafeModeReason.ByRequest,
    });
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirSafeModeCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
