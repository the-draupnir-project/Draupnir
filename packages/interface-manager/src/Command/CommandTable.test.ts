// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Ok } from "@gnuxie/typescript-result";
import { StandardCommandTable } from "./CommandTable";
import { describeCommand } from "./describeCommand";

it("Should be able to import commmands from other tables", function () {
  const AdminCommands = new StandardCommandTable("admin commands");
  const DeactivateCommand = describeCommand({
    summary: "Deactivate a user",
    parameters: [],
    async executor() {
      return Ok(true);
    },
  });
  const ShutdownRoomCommand = describeCommand({
    summary: "Shutdown a room",
    parameters: [],
    async executor() {
      return Ok(true);
    },
  });
  AdminCommands.internCommand(DeactivateCommand, ["deactivate"]).internCommand(
    ShutdownRoomCommand,
    ["shutdown", "room"]
  );
  const DraupnirCommandTable = new StandardCommandTable("Draupnir");
  DraupnirCommandTable.importTable(AdminCommands, []);
  expect(DraupnirCommandTable.getAllCommands().length).toBe(2);
});
