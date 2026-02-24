// SPDX-FileCopyrightText: 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { readCommand } from "./TextCommandReader";
import {
  BooleanPresentationType,
  MatrixRoomIDPresentationType,
  StringPresentationType,
} from "./TextPresentationTypes";
import { Keyword } from "../Command/Keyword";

test("CommandReader can read strings", function () {
  const readResult = readCommand("hello");
  expect(readResult.length).toBe(1);
  expect(readResult.at(0)).toBeDefined();
  expect(readResult.at(0)?.object).toBe("hello");
  expect(readResult.at(0)?.presentationType).toBe(StringPresentationType);
});

test("CommandReader can read a complex command", function () {
  const readResult = readCommand(
    "!draupnir ban @spam:example.com https://matrix.to/#/#coc:example.com spam --some-flag-idk"
  );
  expect(readResult.at(2)?.object).toBeInstanceOf(MatrixUserID);
  expect(readResult.at(3)?.object).toBeInstanceOf(MatrixRoomAlias);
  expect(readResult.at(5)?.object).toBeInstanceOf(Keyword);
});

it("Can read a simple command with only strings", function () {
  const command = "!mjolnir list rooms";
  const readItems = readCommand(command);
  expect(
    readItems.every((item) => command.includes(item.object as string))
  ).toBe(true);
});
it("Can turn room aliases to room references", function () {
  const command = "#meow:example.org";
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBeInstanceOf(MatrixRoomAlias);
  const roomReference = readItems.at(0)?.object as MatrixRoomAlias;
  expect(roomReference.toRoomIDOrAlias()).toBe(command);
});
it("Can turn room ids to room references", function () {
  const command = "!foijoiejfoij:example.org";
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBeInstanceOf(MatrixRoomID);
  const roomReference = readItems.at(0)?.object as MatrixRoomID;
  expect(roomReference.toRoomIDOrAlias()).toBe(command);
});
it("Can read keywords and correctly parse their designators", function () {
  const checkKeyword = (designator: string, keyword: string) => {
    const readItems = readCommand(keyword);
    expect(readItems.at(0)?.object).toBeInstanceOf(Keyword);
    const keywordItem = readItems.at(0)?.object as Keyword;
    expect(keywordItem.designator).toBe(designator);
  };
  checkKeyword("foo", "--foo");
  checkKeyword("foo", "-foo");
  checkKeyword("f", "-f");
  checkKeyword("foo", ":foo");
  checkKeyword("f", ":f");
});
it("Check that malformed room ids and aliases are read as strings", function () {
  // We leave it for the command to validate the arguments it receives intentionally.
  // From the perspective of the user, their command will fail just as early but with more context this way.
  const checkMalformedRoomReference = (badReference: string) => {
    expect(readCommand(badReference).at(0)?.object).toBe(badReference);
  };
  checkMalformedRoomReference("#singasongaboutlife");
  checkMalformedRoomReference("!mjolnir");
});
it("Can parse userID's", function () {
  const command = "@spam:example.com";
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBeInstanceOf(MatrixUserID);
  const user = readItems.at(0)?.object as MatrixUserID;
  expect(user.localpart).toBe("spam");
});

it("It can read numbers", function () {
  const command = "123";
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBe(123);
});

it("It can read booleans", function () {
  const command = "true false";
  const readItems = readCommand(command);
  expect(readItems.at(0)?.presentationType).toBe(BooleanPresentationType);
  expect(readItems.at(0)?.object).toBe(true);
  expect(readItems.at(1)?.object).toBe(false);
});

it("It can read negative integers", function () {
  const command = "-123";
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBe(-123);
});

it("It can read quoted strings", function () {
  const command = '"hello world"';
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBe("hello world");
});

it("It can read unbalanced quoteds strings", function () {
  const command = '"unbalanced vronut';
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBe('"unbalanced');
  expect(readItems.at(1)?.object).toBe("vronut");
});

it("It can read escaped quotes meow", function () {
  const commoand = '"\\"hello \\"';
  const readItems = readCommand(commoand);
  expect(readItems.at(0)?.object).toBe('"hello "');
});

it("It can stop quoted stuff from hitting the post read transforms", function () {
  const command = '"true"';
  const readItems = readCommand(command);
  expect(readItems.at(0)?.object).toBe("true");
  expect(readItems.at(0)?.presentationType).toBe(StringPresentationType);
});

it("Can read V12 roomID's", function () {
  const command = "!arfarfarfarfarfarfarfarfarfarfarfarfarfarfa";
  const readItems = readCommand(command);
  expect(readItems.at(0)?.presentationType).toBe(MatrixRoomIDPresentationType);
});
