// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok } from "@the-draupnir-project/matrix-protection-suite";
import { isError, Result, ResultError } from "@gnuxie/typescript-result";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Units with no calendar ambiguity: this is always `now + amount * ms`, never local calendar-day arithmetic. */
const FIXED_DURATION_UNIT_MS: Record<string, number> = {
  s: MS_PER_SECOND,
  m: MS_PER_MINUTE,
  h: MS_PER_HOUR,
  d: MS_PER_DAY,
  w: MS_PER_WEEK,
};

const TS_PREFIX = "ts:";
// `m` = minutes, `M` = calendar months (case-sensitive).
const RELATIVE_DURATION_PATTERN = /^(\d+)(s|m|h|d|w|M|y)$/;
const BARE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Add whole calendar months or years to `date` (UTC), clamping to the last
 * valid day of the target month if the origin day doesn't exist there
 * (e.g. Jan 31 + 1 month -> Feb 28/29, not an overflow into March).
 */
function addCalendarUnitsUTC(
  date: Date,
  amount: number,
  unit: "M" | "y"
): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  if (unit === "y") {
    result.setUTCFullYear(result.getUTCFullYear() + amount);
  } else {
    result.setUTCMonth(result.getUTCMonth() + amount);
  }
  if (result.getUTCDate() !== originalDay) {
    // Overflowed into the next month because the target month is shorter
    // than the origin day, clamp back to the last day of the intended month.
    result.setUTCDate(0);
  }
  return result;
}

function resolveExpiryInput(input: string, now: number): Result<number> {
  if (input.startsWith(TS_PREFIX)) {
    const rawValue = input.slice(TS_PREFIX.length);
    const timestamp = Number(rawValue);
    if (!Number.isInteger(timestamp)) {
      return ResultError.Result(
        `"${rawValue}" is not a valid integer millisecond timestamp for "ts:".`
      );
    }
    return Ok(timestamp);
  }
  const relativeMatch = RELATIVE_DURATION_PATTERN.exec(input);
  if (relativeMatch !== null) {
    const amountText = relativeMatch[1];
    const unit = relativeMatch[2];
    if (amountText === undefined || unit === undefined) {
      throw new TypeError("The regex is wrong, this should be unreachable");
    }
    const amount = Number(amountText);
    if (unit === "M" || unit === "y") {
      return Ok(addCalendarUnitsUTC(new Date(now), amount, unit).getTime());
    }
    const unitMs = FIXED_DURATION_UNIT_MS[unit];
    if (unitMs === undefined) {
      throw new TypeError(`Unhandled duration unit ${unit}`);
    }
    return Ok(now + amount * unitMs);
  }
  if (
    BARE_DATE_PATTERN.test(input) ||
    ISO_DATETIME_WITH_OFFSET_PATTERN.test(input)
  ) {
    const timestamp = BARE_DATE_PATTERN.test(input)
      ? Date.parse(`${input}T00:00:00.000Z`)
      : Date.parse(input);
    if (Number.isNaN(timestamp)) {
      return ResultError.Result(
        `"${input}" is not a valid ISO 8601 date/date-time.`
      );
    }
    return Ok(timestamp);
  }
  return ResultError.Result(
    `Unable to parse "${input}" as an expiry. Expected a relative duration (e.g. 5m, 2h, 3d, 1w, 1M, 2y), an absolute ISO 8601 date/date-time (e.g. 2026-12-24 or 2026-12-24T10:00:00Z), or a raw millisecond timestamp prefixed with "ts:" (e.g. ts:1234567890000).`
  );
}

/**
 * Parse a `--expires` argument into an absolute millisecond timestamp
 * (MSC3908). Accepts:
 * - `ts:<integer>`: a raw millisecond timestamp.
 * - A relative duration: `<n>s`, `<n>m` (minutes), `<n>h`, `<n>d`, `<n>w`,
 *   `<n>M` (calendar months), or `<n>y` (calendar years).
 * - An absolute ISO 8601 date (`YYYY-MM-DD`, UTC midnight) or date-time
 *   with a mandatory `Z`/`±HH:MM` offset.
 *
 * A resolved timestamp of exactly `0` is passed through unchanged, since
 * MSC3908 defines `expiry: 0` as an explicit "never expires" choice.
 * Any other resolved timestamp that isn't strictly in the future is
 * rejected (matching `isExpired()`'s `expiry <= now` semantics).
 */
export function parseExpiryInput(
  input: string,
  now: number = Date.now()
): Result<number> {
  const resolved = resolveExpiryInput(input, now);
  if (isError(resolved)) {
    return resolved;
  }
  const timestamp = resolved.ok;
  // `<=` (not just `<`) to match `isExpired()`'s semantics, which treats
  // `expiry <= now` as already expired; otherwise this would write a
  // policy that gets reverted the instant it's created.
  if (timestamp !== 0 && timestamp <= now) {
    return ResultError.Result(
      `The expiry "${input}" resolves to a time in the past (or right now). Provide a future time, or use "ts:0" to explicitly mean permanent.`
    );
  }
  return Ok(timestamp);
}
