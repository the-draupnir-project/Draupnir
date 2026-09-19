// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { isError, isOk } from "@the-draupnir-project/matrix-protection-suite";
import expect from "expect";
import { parseExpiryInput } from "../../../src/commands/ParseExpiryInput";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15T12:00:00.000Z

describe("Test parseExpiryInput", function () {
  it("parses a ts: prefixed raw millisecond timestamp", function () {
    const future = NOW + 60_000;
    const result = parseExpiryInput(`ts:${future}`, NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.ok).toBe(future);
    }
  });

  it("treats ts:0 as an explicit permanent expiry, not a rejected past date", function () {
    const result = parseExpiryInput("ts:0", NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.ok).toBe(0);
    }
  });

  it("rejects a non-integer ts: value", function () {
    const result = parseExpiryInput("ts:not-a-number", NOW);
    expect(isError(result)).toBe(true);
  });

  const fixedDurationCases: [string, number][] = [
    ["5s", 5 * 1000],
    ["5m", 5 * 60 * 1000],
    ["5h", 5 * 60 * 60 * 1000],
    ["3d", 3 * 24 * 60 * 60 * 1000],
    ["2w", 2 * 7 * 24 * 60 * 60 * 1000],
  ];
  for (const [input, expectedMs] of fixedDurationCases) {
    it(`resolves the fixed relative duration ${input}`, function () {
      const result = parseExpiryInput(input, NOW);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.ok).toBe(NOW + expectedMs);
      }
    });
  }

  it("resolves calendar months (M) relative to now", function () {
    const result = parseExpiryInput("1M", NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(new Date(result.ok).toISOString()).toBe(
        "2026-02-15T12:00:00.000Z"
      );
    }
  });

  it("resolves calendar years (y) relative to now, leap-year aware", function () {
    const leapDayNow = Date.UTC(2028, 1, 29, 0, 0, 0); // 2028-02-29
    const result = parseExpiryInput("1y", leapDayNow);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // 2029 is not a leap year, so Feb 29 clamps to Feb 28.
      expect(new Date(result.ok).toISOString()).toBe(
        "2029-02-28T00:00:00.000Z"
      );
    }
  });

  it("clamps month overflow instead of rolling into the wrong month", function () {
    const jan31 = Date.UTC(2026, 0, 31, 0, 0, 0); // 2026-01-31
    const result = parseExpiryInput("1M", jan31);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // February 2026 has 28 days, so this must clamp rather than become March 3rd.
      expect(new Date(result.ok).toISOString()).toBe(
        "2026-02-28T00:00:00.000Z"
      );
    }
  });

  it("is case-sensitive between m (minutes) and M (months)", function () {
    const minutes = parseExpiryInput("1m", NOW);
    const months = parseExpiryInput("1M", NOW);
    expect(isOk(minutes)).toBe(true);
    expect(isOk(months)).toBe(true);
    if (isOk(minutes) && isOk(months)) {
      expect(minutes.ok).not.toBe(months.ok);
    }
  });

  it("parses a bare ISO date as UTC midnight", function () {
    const result = parseExpiryInput("2026-12-24", NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(new Date(result.ok).toISOString()).toBe(
        "2026-12-24T00:00:00.000Z"
      );
    }
  });

  it("parses a full ISO date-time with a Z offset", function () {
    const result = parseExpiryInput("2026-12-24T10:00:00Z", NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(new Date(result.ok).toISOString()).toBe(
        "2026-12-24T10:00:00.000Z"
      );
    }
  });

  it("parses a full ISO date-time with a non-UTC offset", function () {
    const result = parseExpiryInput("2026-12-24T10:00:00+02:00", NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(new Date(result.ok).toISOString()).toBe(
        "2026-12-24T08:00:00.000Z"
      );
    }
  });

  it("rejects an offset-less ISO date-time as ambiguous", function () {
    const result = parseExpiryInput("2026-12-24T10:00:00", NOW);
    expect(isError(result)).toBe(true);
  });

  it("rejects garbage input", function () {
    const result = parseExpiryInput("not an expiry at all", NOW);
    expect(isError(result)).toBe(true);
  });

  it("rejects a resolved timestamp that is in the past", function () {
    const result = parseExpiryInput("2020-01-01", NOW);
    expect(isError(result)).toBe(true);
  });

  it("rejects a resolved timestamp equal to now", function () {
    const result = parseExpiryInput(new Date(NOW).toISOString(), NOW);
    expect(isError(result)).toBe(true);
  });
});
