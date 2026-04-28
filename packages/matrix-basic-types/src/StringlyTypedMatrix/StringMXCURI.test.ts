// Copyright 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringMXCURI,
  isStringMXCURI,
  mxcURIMediaId,
  mxcURIServerName,
} from "./StringMXCURI";

test("isStringMXCURI accepts valid MXC URIs", function () {
  expect(isStringMXCURI("mxc://matrix.org/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://matrix.org:8888/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://1.2.3.4/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://1.2.3.4:1234/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://[1234:5678::abcd]/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://[1234:5678::abcd]:5678/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://[::1]/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://[::1]:8008/abc123")).toBe(true);
  expect(isStringMXCURI("mxc://matrix.org/a_b-c123")).toBe(true);
});

test("isStringMXCURI rejects invalid MXC URIs", function () {
  expect(isStringMXCURI("invalid://matrix.org/abc123")).toBe(false);
  expect(isStringMXCURI("mxc://matrix.org")).toBe(false);
  expect(isStringMXCURI("mxc://matrix.org/abc 123")).toBe(false);
  expect(isStringMXCURI("mxc://example.com~invalid/abc123")).toBe(false);
  expect(isStringMXCURI("mxc://matrix.org/abc.def")).toBe(false);
  expect(isStringMXCURI("mxc://matrix.org/abc~def")).toBe(false);
});

test("StringMXCURI accessors", function () {
  const uri = StringMXCURI(
    "mxc://[1234:5678::abcd]:5678/abc123"
  ) as StringMXCURI;

  expect(mxcURIServerName(uri)).toBe("[1234:5678::abcd]:5678");
  expect(mxcURIMediaId(uri)).toBe("abc123");
});
