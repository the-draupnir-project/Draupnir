// Copyright (C) 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { ConstantPeriodBatch } from "./ConstantPeriodBatch";

export interface TimedGate {
  enqueueOpen(): void;
  destroy(): void;
}

/**
 * A linear gate around a background task.
 * 1. If it's been longer than the delayMS since the task was last run,
 *   it will run the task immediately (open the gate).
 * 2. If it's been less than the delayMS since the task was last run,
 *  the task will be scheduled to run after the remaining delayMS has elapsed.
 * 3. If the task is already running, we will not run it again until it finishes,
 *   but we will enqueue a follow-up task to run immediately after the current task finishes.
 *
 * This means that there will only ever be 1 task running and one task enqueued to
 * follow up. With no chains of follow-up tasks.
 */
export class StandardTimedGate implements TimedGate {
  private gateLastOpenAt: number = 0;
  private batch: ConstantPeriodBatch | null = null;
  private backgroundTask: GatedBackgroundTask | null = null;
  public constructor(
    private readonly cb: GatedBackgroundTaskFactory,
    private readonly delayMS = 0
  ) {
    // nothing to do.
  }

  public enqueueOpen(): void {
    // house keeping first.
    if (this.backgroundTask?.isFinished()) {
      this.backgroundTask = null;
    }
    this.backgroundTask?.enqueueFollowUp();
    if (this.batch !== null && !this.batch.isFinished()) {
      return;
    }
    const now = Date.now();
    const msSinceLastOpen = now - this.gateLastOpenAt;
    const remainingDelayMS = Math.max(0, this.delayMS - msSinceLastOpen);
    this.batch = new ConstantPeriodBatch(() => {
      this.gateLastOpenAt = Date.now();
      this.backgroundTask = new StandardGatedBackgroundTask(this.cb, this);
    }, remainingDelayMS);
  }

  public destroy(): void {
    this.batch?.cancel();
    this.backgroundTask?.cancel();
  }
}

export interface GatedBackgroundTask {
  isFinished(): boolean;
  enqueueFollowUp(): void;
  cancel(): void;
  isCancelled(): boolean;
}

export type GatedBackgroundTaskFactory = (
  taskTracker: GatedBackgroundTask
) => Promise<void>;

export class StandardGatedBackgroundTask implements GatedBackgroundTask {
  #isFinished = false;
  #isCancelled = false;
  private enqueueCalledWhileTaskActive = false;
  public constructor(
    taskFactory: GatedBackgroundTaskFactory,
    parentGate: TimedGate
  ) {
    void taskFactory(this).finally(() => {
      this.#isFinished = true;
      if (this.enqueueCalledWhileTaskActive) {
        parentGate.enqueueOpen();
      }
    });
  }

  public isFinished(): boolean {
    return this.#isFinished;
  }

  public isCancelled(): boolean {
    return this.#isCancelled;
  }

  public enqueueFollowUp(): void {
    if (!this.#isCancelled) {
      this.enqueueCalledWhileTaskActive = true;
    }
  }

  public cancel(): void {
    this.#isCancelled = true;
    this.enqueueCalledWhileTaskActive = false;
  }
}
