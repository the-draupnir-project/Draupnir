// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError } from "../Interface/Action";
import { SafeMembershipEventMirror } from "./SafeMembershipEvent";

test("This example from a client that pollutes nulls like no tomorrow", function () {
  const unknownContent = {
    avatar_url: null,
    displayname: "robb",
    membership: "join",
  };
  const result = SafeMembershipEventMirror.parse(unknownContent);
  if (isError(result)) {
    throw new TypeError(`This should be parsable`);
  }
  const safeContent = result.ok;
  expect(safeContent.avatar_url).toBe(undefined);
  expect(safeContent.displayname).toBe(unknownContent.displayname);
  expect(safeContent.membership).toBe(unknownContent.membership);
  const unsafeContent = SafeMembershipEventMirror.getUnsafeContent(safeContent);
  expect(unsafeContent).toBeDefined();
  if (unsafeContent === undefined) {
    throw new TypeError("unsafe content is supposed to be defined");
  }
  expect(unsafeContent["avatar_url"]).toBe(null);
});

test("hidden properties do not leak", function () {
  const unknownContent = {
    avatar_url: null,
    displayname: "robb",
    membership: "join",
  };
  const result = SafeMembershipEventMirror.parse(unknownContent);
  if (isError(result)) {
    throw new TypeError(`This should be parsable`);
  }
  const safeContent = result.ok;
  expect(Object.entries(safeContent).length).toBe(2);
});
