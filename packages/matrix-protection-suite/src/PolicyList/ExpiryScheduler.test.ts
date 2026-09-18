// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { PolicyRoomRevision } from "./PolicyListRevision";
import { PolicyRuleChange } from "./PolicyRuleChange";
import { ExpirySchedulerHost, ExpiryScheduler } from "./ExpiryScheduler";

function makeHost(nextExpiringTimestamp: number | undefined): {
  host: ExpirySchedulerHost;
  emitSpy: jest.Mock;
  changesFromExpirySpy: jest.Mock;
} {
  const emitSpy = jest.fn();
  // Mirrors real behaviour: once a rule has been swept away it no longer
  // contributes to future `changesFromExpiry`/`nextExpiringTimestamp` calls.
  let expired = false;
  const changesFromExpirySpy = jest.fn((now: number): PolicyRuleChange[] => {
    if (
      !expired &&
      nextExpiringTimestamp !== undefined &&
      nextExpiringTimestamp <= now
    ) {
      expired = true;
      return [
        {
          changeType: 0,
        } as unknown as PolicyRuleChange,
      ];
    }
    return [];
  });
  const revision = {
    nextExpiringTimestamp: () => (expired ? undefined : nextExpiringTimestamp),
    changesFromExpiry: changesFromExpirySpy,
    reviseFromChanges: () => revision,
  } as unknown as PolicyRoomRevision;
  const host: ExpirySchedulerHost = {
    currentRevision: revision,
    emit: emitSpy,
  };
  return { host, emitSpy, changesFromExpirySpy };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test("does nothing when there is no upcoming expiry", function () {
  const { host, emitSpy } = makeHost(undefined);
  const scheduler = new ExpiryScheduler(host, 0);
  scheduler.scheduleNext();
  jest.advanceTimersByTime(1000 * 60 * 60);
  expect(emitSpy).not.toHaveBeenCalled();
});

test("fires exactly at the precise expiry timestamp, not some coarser interval", function () {
  const now = Date.now();
  const { host, emitSpy } = makeHost(now + 5000);
  const scheduler = new ExpiryScheduler(host, 0);
  scheduler.scheduleNext();
  jest.advanceTimersByTime(4999);
  expect(emitSpy).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(emitSpy).toHaveBeenCalledTimes(1);
});

test("debounceMS delays the sweep to allow coalescing, 0 means no delay", function () {
  const now = Date.now();
  const { host, emitSpy } = makeHost(now + 1000);
  const scheduler = new ExpiryScheduler(host, 2000);
  scheduler.scheduleNext();
  jest.advanceTimersByTime(1000);
  expect(emitSpy).not.toHaveBeenCalled();
  jest.advanceTimersByTime(2000);
  expect(emitSpy).toHaveBeenCalledTimes(1);
});

test("repeated scheduleNext calls in quick succession leave exactly one live timer", function () {
  const now = Date.now();
  const { host, emitSpy } = makeHost(now + 1000);
  const scheduler = new ExpiryScheduler(host, 0);
  for (let i = 0; i < 50; i++) {
    scheduler.scheduleNext();
  }
  expect(jest.getTimerCount()).toBe(1);
  jest.advanceTimersByTime(1000);
  expect(emitSpy).toHaveBeenCalledTimes(1);
});

test("unregister cancels the pending sweep", function () {
  const now = Date.now();
  const { host, emitSpy } = makeHost(now + 1000);
  const scheduler = new ExpiryScheduler(host, 0);
  scheduler.scheduleNext();
  scheduler.unregister();
  jest.advanceTimersByTime(10000);
  expect(emitSpy).not.toHaveBeenCalled();
});
