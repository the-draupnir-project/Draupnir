// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  MatrixRoomID,
  MatrixRoomReference,
  MatrixUserID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { describeCommand } from "./describeCommand";
import { Ok, Result, isError, isOk } from "@gnuxie/typescript-result";
import {
  MatrixRoomIDPresentationType,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StandardJSInterfaceCommandDispatcher,
  StringPresentationType,
  readCommand,
} from "../TextReader";
import { StandardParsedKeywords } from "./ParsedKeywords";
import { tuple } from "./ParameterParsing";
import { PromptOptions } from "./PromptForAccept";
import { makePartialCommand } from "./Command";
import { StandardPresentationArgumentStream } from "./PresentationStream";
import { StandardCommandTable } from "./CommandTable";
import { union } from "./PresentationSchema";
import { CommandDescription } from "./CommandDescription";

it("Can define and execute commands.", async function () {
  type Context = {
    banUser(
      room: MatrixRoomReference,
      user: MatrixUserID
    ): Promise<Result<boolean>>;
    getProtectedRooms(): MatrixRoomID[];
  };
  // i think what we have to do is split describeCommand into two parts :(
  // The first extracts the parameters and possibly accepts the `context` as a type parmater.
  // then the function it returns accepts the executor.
  const BanCommand = describeCommand({
    summary: "Ban a user from a room",
    async executor(
      context: Context,
      _info,
      _keywords,
      _rest,
      user,
      room
    ): Promise<Result<boolean>> {
      return await context.banUser(room, user);
    },
    parameters: tuple(
      {
        name: "user",
        acceptor: MatrixUserIDPresentationType,
      },
      {
        name: "target room",
        acceptor: MatrixRoomReferencePresentationSchema,
        async prompt(
          context: Context
        ): Promise<Result<PromptOptions<MatrixRoomID>>> {
          return Ok({
            suggestions: context
              .getProtectedRooms()
              .map((room) => MatrixRoomIDPresentationType.wrap(room)),
          });
        },
      }
    ),
  });
  const banResult = await BanCommand.executor(
    {
      async banUser(room, user) {
        expect(room.toRoomIDOrAlias()).toBe("!foo:example.com");
        expect(user.toString()).toBe("@foo:example.com");
        return Ok(true);
      },
      getProtectedRooms() {
        return [new MatrixRoomID("!foo:example.com")];
      },
    },
    {},
    new StandardParsedKeywords(
      BanCommand.parametersDescription.keywords,
      new Map()
    ),
    [],
    new MatrixUserID("@foo:example.com" as StringUserID),
    MatrixRoomReference.fromRoomID("!foo:example.com" as StringRoomID, [])
  );
  expect(isOk(banResult)).toBe(true);
});

it("Can define keyword arguments.", async function () {
  const KeywordsCommandTest = describeCommand({
    summary: "A command to test keyword arguments",
    async executor(
      _context: never,
      _info: unknown,
      _keywords
    ): Promise<Result<unknown>> {
      return Ok(undefined);
    },
    parameters: [],
    keywords: {
      keywordDescriptions: {
        "dry-run": {
          isFlag: true,
          description:
            "Runs the kick command without actually removing any users.",
        },
        glob: {
          isFlag: true,
          description:
            "Allows globs to be used to kick several users from rooms.",
        },
        room: {
          acceptor: MatrixRoomReferencePresentationSchema,
          description:
            "Allows the command to be scoped to just one protected room.",
        },
      },
    },
  });
  const parseResults = KeywordsCommandTest.parametersDescription.parse(
    makePartialCommand(
      new StandardPresentationArgumentStream(
        readCommand(`--dry-run --room !foo:example.com`)
      ),
      KeywordsCommandTest,
      new StandardCommandTable(Symbol("KeywordsCommandTest")),
      []
    )
  );
  if (isError(parseResults)) {
    throw new TypeError(
      `Failed to parse for some reason: ${parseResults.error.mostRelevantElaboration}`
    );
  }
  const keywords = parseResults.ok.keywords;
  expect(keywords.getKeywordValue("dry-run")).toBe(true);
  expect(keywords.getKeywordValue("glob", false)).toBe(false);
  expect(
    keywords.getKeywordValue<MatrixRoomReference>("room")?.toRoomIDOrAlias()
  ).toEqual("!foo:example.com");
});

it("end to end test a command that parses mxids", async function () {
  const tableName = Symbol("ParseTest");
  const testTable = new StandardCommandTable(tableName);
  const helpCommand = describeCommand({
    summary: "Mimicks the help command",
    parameters: [],
    async executor(): Promise<Result<string>> {
      return Ok("here is your help");
    },
  });
  const unbanCommand = describeCommand({
    summary: "Mimicks the unban command",
    parameters: tuple({
      name: "entity",
      acceptor: union(
        MatrixUserIDPresentationType,
        MatrixRoomReferencePresentationSchema,
        StringPresentationType
      ),
    }),
    async executor(
      _context: never,
      _info,
      _keywords,
      _rest,
      entity
    ): Promise<Result<MatrixRoomReference | string | MatrixUserID>> {
      return Ok(entity);
    },
  });
  testTable.internCommand(unbanCommand as CommandDescription, [
    "draupnir",
    "unban",
  ]);
  const dispatcher = new StandardJSInterfaceCommandDispatcher(
    testTable,
    helpCommand,
    undefined,
    { commandNormaliser: (body) => body }
  );
  const result = await dispatcher.invokeCommandFromBody(
    { commandSender: "@test:localhost" as StringUserID },
    "draupnir unban @spam:example.com"
  );
  if (isError(result)) {
    throw new TypeError(`Not supposed to be error mate`);
  }
  expect(result.ok).toBeInstanceOf(MatrixUserID);
});
