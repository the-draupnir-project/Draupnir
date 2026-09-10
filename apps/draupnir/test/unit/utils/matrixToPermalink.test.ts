// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
// SPDX-License-Identifier: Apache-2.0

import expect from "expect";
import { matrixToPermalink } from "../../../src/utils";

describe("matrixToPermalink", function () {
  it("builds a matrix.to link with a single via", function () {
    const room = "!wJbHKdEdDUKQRGGImO:feline.support";
    const via = "feline.support";
    const result = matrixToPermalink(room, via);
    expect(result).toBe(
      `https://matrix.to/#/${encodeURIComponent(room)}?via=${encodeURIComponent(
        via
      )}`
    );
  });
});
