// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Logger } from "../Logging/Logger";
import { PolicyRoomRevision } from "./PolicyListRevision";
import { PolicyRuleChange } from "./PolicyRuleChange";

const log = new Logger("ExpiryScheduler");

/** Fallback used by consumers that don't wire a configured value through (e.g. tests). */
export const DEFAULT_EXPIRY_DEBOUNCE_MS = 2_000;

/**
 * The minimal surface an issuer needs to provide for `ExpiryScheduler` to
 * revert expired policies on its behalf (MSC3908).
 */
export interface ExpirySchedulerHost {
  currentRevision: PolicyRoomRevision;
  emit(
    event: "revision",
    nextRevision: PolicyRoomRevision,
    changes: PolicyRuleChange[],
    previousRevision: PolicyRoomRevision
  ): boolean;
}

/**
 * MSC3908: schedules a precisely-timed sweep for the next rule that is due to
 * expire, removing it (and any other rules that have since become expired)
 * from the revision and emitting a "revision" event so that protections
 * revert their effects the same way they would for a redacted/removed rule.
 *
 * This intentionally never polls on a fixed interval, only ever schedules for
 * the exact next known expiry (plus `debounceMS`, which exists purely to let
 * the scheduler coalesce rules that expire within a short window of each other
 * into a single revision/emit rather than one per rule; `0` disables that
 * coalescing and reverts each rule at its own precise expiry).
 *
 * We are using the fact that the MSC explicitly defines that taking a expiry
 * choice is up to our judgement and therefore we can arbitrarily delay expiry
 * to allow coalescing of multiple expiries within a short window without worrying
 * about violating the expiry semantics of the MSC.
 */
export class ExpiryScheduler {
  private timeout: NodeJS.Timeout | undefined;

  public constructor(
    private readonly host: ExpirySchedulerHost,
    private readonly debounceMS: number = DEFAULT_EXPIRY_DEBOUNCE_MS
  ) {}

  public scheduleNext(): void {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    const nextTimestamp = this.host.currentRevision.nextExpiringTimestamp();
    if (nextTimestamp === undefined) {
      return;
    }
    const delayMS = Math.max(0, nextTimestamp - Date.now()) + this.debounceMS;
    this.timeout = setTimeout(() => {
      this.checkExpiry();
    }, delayMS);
  }

  private checkExpiry(): void {
    this.timeout = undefined;
    const previousRevision = this.host.currentRevision;
    const changes = previousRevision.changesFromExpiry(Date.now());
    if (changes.length > 0) {
      const nextRevision = previousRevision.reviseFromChanges(changes);
      this.host.currentRevision = nextRevision;
      this.host.emit("revision", nextRevision, changes, previousRevision);
    } else {
      log.warn(
        "Expiry timer fired but no rules had actually expired, this shouldn't normally happen"
      );
    }
    this.scheduleNext();
  }

  public unregister(): void {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }
}
