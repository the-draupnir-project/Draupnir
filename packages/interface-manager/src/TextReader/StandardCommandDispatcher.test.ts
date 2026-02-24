// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Ok, isError } from "@gnuxie/typescript-result";
import { StandardCommandDispatcher } from "./StandardCommandDispatcher";
import { describeCommand } from "../Command/describeCommand";
import { TopPresentationSchema } from "../Command/PresentationSchema";
import { StandardCommandTable } from "../Command/CommandTable";

const HelpCommand = describeCommand({
  summary: "Shows the help for this command table",
  parameters: [],
  rest: {
    name: "command arguments",
    acceptor: TopPresentationSchema,
  },
  async executor() {
    return Ok("Shows the help for this command table [this is a test].");
  },
});

it("Can parse a partial command", function () {
  const testTable = new StandardCommandTable(Symbol("TestTable"));
  testTable.internCommand(HelpCommand, ["testbot", "help"]);
  const dispatcher = new StandardCommandDispatcher(testTable, HelpCommand, {
    commandNormaliser: (body) => body,
  });
  const partialCommand = dispatcher.parsePartialCommandFromBody(
    { commandSender: "test" },
    "testbot help unban"
  );
  if (isError(partialCommand)) {
    throw new TypeError("Should be able to parse the command just fine");
  }
  expect(partialCommand.ok.designator.length).toBe(2);
  expect(partialCommand.ok.stream.peekItem()?.object).toBe("unban");
});
