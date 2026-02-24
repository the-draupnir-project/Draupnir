// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
import {
  StringRoomAlias,
  isStringRoomAlias,
  isStringRoomID,
  isStringUserID,
  roomAliasLocalpart,
  userServerName,
  userLocalpart,
  StringUserID,
  isStringServerName,
  roomAliasServerName,
} from "./";

test("isStringUserID", function () {
  expect(isStringUserID("@foo:localhost:9999")).toBe(true);
  expect(isStringUserID("@foo@mastodon.social")).toBe(false);
  expect(isStringUserID("@ synapse is really bad :example.com")).toBe(true);
});

test("StringUserID serverName", function () {
  expect(userServerName(StringUserID("@foo:localhost:9999"))).toBe(
    "localhost:9999"
  );
});

test("StringUserID localpart", function () {
  expect(userLocalpart(StringUserID("@foo:localhost:9999"))).toBe("foo");
});

test("StringRoomID", function () {
  expect(isStringRoomID("!foo:localhost:9999")).toBe(true);
  expect(isStringRoomID("@foo:localhost:9999")).toBe(false);
});

test("StringRoomAlias", function () {
  expect(isStringRoomAlias("#foo:example.com")).toBe(true);
  expect(isStringRoomAlias("!foo:example.com")).toBe(false);
});

test("StringRoomAlias roomAliasLocalpart", function () {
  expect(roomAliasLocalpart(StringRoomAlias("#foo:example.com"))).toBe("foo");
});

test("StringroomAlias serverName", function () {
  expect(roomAliasServerName(StringRoomAlias("#foo:localhost:9999"))).toBe(
    "localhost:9999"
  );
});

test("StringServerName", function () {
  expect(isStringServerName("example.com")).toBe(true);
});

// test accessing server names!!!!
