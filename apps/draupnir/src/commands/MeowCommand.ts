// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
// SPDX-License-Identifier: AFL-3.0

import { describeCommand } from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { Ok, Result } from "@gnuxie/typescript-result";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirMeowCommand = describeCommand({
  summary: "The bot responds with Meow.",
  parameters: [],
  async executor(draupnir: Draupnir): Promise<Result<void>> {
    await draupnir.client.sendMessage(draupnir.managementRoomID, {
      msgtype: "m.text",
      body: "Meow",
    });
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirMeowCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
