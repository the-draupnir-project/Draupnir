// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Ok } from "@gnuxie/typescript-result";
import { describeCommand } from "../Command/describeCommand";
import { StandardCommandTable } from "../Command/CommandTable";
import { StringPresentationType } from "./TextPresentationTypes";
import { CommandDescription } from "../Command";
import {
  StringfromBooleanTranslator,
  StringFromMatrixRoomAliasTranslator,
  StringFromMatrixUserIDTranslator,
  StringFromNumberTranslator,
} from "./TextTranslators";
import { StandardJSInterfaceCommandDispatcher } from "./JSInterfaceCommandDispatcher";
import { StandardAdaptorContextToCommandContextTranslator } from "../Adaptor";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

const ReasonAcceptingCommand = describeCommand({
  summary: "accepts a reason as a string",
  parameters: [],
  rest: {
    name: "command arguments",
    acceptor: StringPresentationType,
  },
  async executor(_context, _info, _keywords, rest) {
    expect(rest.join(" ")).toBe(
      "hello 1234 @foo:localhost:9999 https://matrix.to/#/%23bar%3Alocalhost%3A9999 false"
    );
    return Ok("Accepts a reason for a ban or something.");
  },
});

const testTable = new StandardCommandTable(Symbol("TestTable"));

const JSDispatcher = new StandardJSInterfaceCommandDispatcher(
  testTable,
  ReasonAcceptingCommand as CommandDescription,
  undefined,
  { commandNormaliser: (body) => body },
  new StandardAdaptorContextToCommandContextTranslator()
);

it("Can parse a partial command", async function () {
  testTable.internCommand(ReasonAcceptingCommand as CommandDescription, [
    "testbot",
    "reason",
  ]);
  testTable
    .internPresentationTypeTranslator(StringFromNumberTranslator)
    .internPresentationTypeTranslator(StringFromMatrixUserIDTranslator)
    .internPresentationTypeTranslator(StringFromMatrixRoomAliasTranslator)
    .internPresentationTypeTranslator(StringfromBooleanTranslator);
  const commandBody =
    "testbot reason hello 1234 @foo:localhost:9999 https://matrix.to/#/#bar:localhost:9999 false";
  const result = await JSDispatcher.invokeCommandFromBody(
    { commandSender: "@foo:localhost:9999" as StringUserID },
    commandBody
  );
  result.expect("Command should have worked");
});
