// Copyright 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringMediaURI,
  isStringMediaURI,
  MediaURIMediaID,
  MediaURIServerName,
} from "./StringMediaURI";

test("isStringMediaURI accepts valid MXC URIs", function () {
  expect(isStringMediaURI("mxc://matrix.org/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://matrix.org:8888/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://1.2.3.4/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://1.2.3.4:1234/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://[1234:5678::abcd]/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://[1234:5678::abcd]:5678/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://[::1]/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://[::1]:8008/abc123")).toBe(true);
  expect(isStringMediaURI("mxc://matrix.org/a_b-c123")).toBe(true);
});

test("isStringMediaURI rejects invalid MXC URIs", function () {
  expect(isStringMediaURI("invalid://matrix.org/abc123")).toBe(false);
  expect(isStringMediaURI("mxc://matrix.org")).toBe(false);
  expect(isStringMediaURI("mxc://matrix.org/abc 123")).toBe(false);
  expect(isStringMediaURI("mxc://example.com~invalid/abc123")).toBe(false);
  expect(isStringMediaURI("mxc://matrix.org/abc.def")).toBe(false);
  expect(isStringMediaURI("mxc://matrix.org/abc~def")).toBe(false);
});

test("StringMediaURI accessors", function () {
  const uri = StringMediaURI("mxc://[1234:5678::abcd]:5678/abc123");

  expect(MediaURIServerName(uri)).toBe("[1234:5678::abcd]:5678");
  expect(MediaURIMediaID(uri)).toBe("abc123");
});
