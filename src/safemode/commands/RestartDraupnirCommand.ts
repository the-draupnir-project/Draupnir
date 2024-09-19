// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { describeCommand } from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../../Draupnir";
import { SafeModeDraupnir } from "../DraupnirSafeMode";
import { Result } from "@gnuxie/typescript-result";
import { SafeModeInterfaceAdaptor } from "./SafeModeAdaptor";

export const SafeModeRestartCommand = describeCommand({
  summary: "Restart Draupnir, quitting safe mode.",
  parameters: [],
  async executor({
    safeModeToggle,
  }: SafeModeDraupnir): Promise<Result<Draupnir>> {
    return safeModeToggle.switchToDraupnir({ sendStatusOnStart: true });
  },
});

SafeModeInterfaceAdaptor.describeRenderer(SafeModeRestartCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
