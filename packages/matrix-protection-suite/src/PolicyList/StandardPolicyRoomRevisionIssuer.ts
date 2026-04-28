// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { EventEmitter } from "stream";
import { PolicyRoomRevision } from "./PolicyListRevision";
import { PolicyRoomRevisionIssuer } from "./PolicyListRevisionIssuer";
import { PolicyRoomManager } from "./PolicyRoomManger";
import { isError } from "../Interface/Action";
import { Logger } from "../Logging/Logger";
import { PolicyRuleEvent } from "../MatrixTypes/PolicyEvents";
import { Redaction } from "../MatrixTypes/Redaction";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule } from "./PolicyRule";

const log = new Logger("StandardPolicyRoomRevisionIssuer");

/**
 * A standard implementation of PolicyRoomRevisionIssuer.
 */
export class StandardPolicyRoomRevisionIssuer
  extends EventEmitter
  implements PolicyRoomRevisionIssuer
{
  private readonly batcher: RevisionBatcher;
  /**
   * Creates a new StandardPolicyRoomRevisionIssuer, you shouldn't have to use this,
   * instead use the `PolicyRoomManager`.
   * @see {@link PolicyRoomManager}.
   * @param room The matrix room to issue revisions for.
   * @param currentRevision The current revision for the room, can be blank.
   * @param policyListManager The policy list manager to use to fetch room state with.
   */
  constructor(
    public readonly room: MatrixRoomID,
    public currentRevision: PolicyRoomRevision,
    policyListManager: PolicyRoomManager
  ) {
    super();
    this.batcher = new RevisionBatcher(this, policyListManager);
  }

  updateForStateEvent(event: PolicyRuleEvent): void {
    if (this.currentRevision.hasEvent(event.event_id)) {
      return;
    }
    this.batcher.addToBatch(event.event_id);
  }

  updateForRedactionEvent(event: Redaction): void {
    if (this.currentRevision.hasEvent(event.event_id)) {
      return;
    }
    this.batcher.addToBatch(event.event_id);
  }

  updateForRevealedPolicies(policies: LiteralPolicyRule[]): void {
    const changes = this.currentRevision.changesFromRevealedPolicies(policies);
    if (changes.length === 0) {
      return;
    }
    const previousRevision = this.currentRevision;
    this.currentRevision = previousRevision.reviseFromChanges(changes);
    this.emit("revision", this.currentRevision, changes, previousRevision);
  }

  public unregisterListeners(): void {
    // nothing to do.
  }
}

/**
 * Helper class that emits a batch event on a `PolicyList` when it has made a batch
 * out of the Matrix events given to `addToBatch` via `updateForEvent`.
 * The `RevisionBatcher` will then call `list.update()` on the associated `PolicyList` once it has finished batching events.
 */
class RevisionBatcher {
  // Whether we are waiting for more events to form a batch.
  private isWaiting = false;
  // The latest (or most recent) event we have received.
  private latestEventId: string | null = null;
  private readonly waitPeriodMS = 200; // 200ms seems good enough.
  private readonly maxWaitMS = 3000; // 3s is long enough to wait while batching.
  // Events that the batcher has been informed of
  private batchedEvents = new Set<string /* event id */>();

  constructor(
    private readonly policyListRevisionIssuer: StandardPolicyRoomRevisionIssuer,
    private readonly policyListManager: PolicyRoomManager
  ) {}

  /**
   * Reset the state for the next batch.
   */
  private reset() {
    this.latestEventId = null;
    this.isWaiting = false;
    this.batchedEvents.clear();
  }

  /**
   * Checks if any more events have been added to the current batch since
   * the previous iteration, then keep waiting up to `this.maxWait`, otherwise stop
   * and emit a batch.
   * @param eventId The id of the first event for this batch.
   */
  private async checkBatch(eventId: string): Promise<void> {
    const start = Date.now();
    do {
      await new Promise((resolve) => setTimeout(resolve, this.waitPeriodMS));
    } while (
      Date.now() - start < this.maxWaitMS &&
      this.latestEventId !== eventId
    );
    this.reset();
    // batching finished, update the associated list.
    await this.createBatchedRevision();
  }

  /**
   * Adds an event to the batch.
   * @param eventId The event to inform the batcher about.
   */
  public addToBatch(eventId: string): void {
    if (this.batchedEvents.has(eventId)) {
      return;
    }
    this.latestEventId = eventId;
    this.batchedEvents.add(eventId);
    if (this.isWaiting) {
      return;
    }
    this.isWaiting = true;
    // We 'spawn' off here after performing the checks above
    // rather than before (ie if `addToBatch` was async) because
    // `banListTest` showed that there were 100~ ACL events per protected room
    // as compared to just 5~ by doing this. Not entirely sure why but it probably
    // has to do with queuing up `n event` tasks on the event loop that exaust scheduling
    // (so the latency between them is percieved as much higher by
    // the time they get checked in `this.checkBatch`, thus batching fails).
    void this.checkBatch(eventId);
  }

  private async createBatchedRevision(): Promise<void> {
    const roomID = this.policyListRevisionIssuer.room;
    const policyRuleEventsResult =
      await this.policyListManager.getPolicyRuleEvents(roomID);
    if (isError(policyRuleEventsResult)) {
      log.error(
        `Unable to fetch policy rule events for ${roomID.toPermalink()}, this is really bad if this error is persistent`
      );
      return;
    }
    const nextRevision =
      this.policyListRevisionIssuer.currentRevision.reviseFromState(
        policyRuleEventsResult.ok
      );
    const previousRevision = this.policyListRevisionIssuer.currentRevision;
    const changes = previousRevision.changesFromState(
      policyRuleEventsResult.ok
    );
    this.policyListRevisionIssuer.currentRevision = nextRevision;
    this.policyListRevisionIssuer.emit(
      "revision",
      nextRevision,
      changes,
      previousRevision
    );
  }
}
