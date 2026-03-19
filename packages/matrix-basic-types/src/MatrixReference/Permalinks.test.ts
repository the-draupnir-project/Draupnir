// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: MIT

import { isError } from "@gnuxie/typescript-result";
import {
  MatrixEventReference,
  MatrixRoomReference,
} from "./MatrixRoomReference";

it("Parses a MatrixRoomID", function () {
  const url = "https://matrix.to/#/!foo:example.com?via=example.com";
  const parseResult = MatrixRoomReference.fromPermalink(url);
  if (isError(parseResult)) {
    throw new TypeError(`Stuff is broken mare`);
  }
  expect(parseResult.ok.toRoomIDOrAlias()).toBe("!foo:example.com");
});

it("Parses a MatrixRoomReference to an event", function () {
  const url =
    "https://matrix.to/#/!ljEauqZaRNkUHrjWpz%3Alocalhost%3A9999/%24Krd34VAtqnAi1GHL0CRVYBiMN4KTCaWEF_Zn3021kr8";
  const parseResult = MatrixEventReference.fromPermalink(url);
  if (isError(parseResult)) {
    throw new TypeError(`Stuff is broken mare`);
  }
  expect(parseResult.ok.eventID).toBe(
    "$Krd34VAtqnAi1GHL0CRVYBiMN4KTCaWEF_Zn3021kr8"
  );
});
