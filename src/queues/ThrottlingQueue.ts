// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { LogLevel } from "matrix-bot-sdk";
import ManagementRoomOutput from "../managementroom/ManagementRoomOutput";
import { Result, isError } from "@gnuxie/typescript-result";

export type TaskFactory<T> = () => Promise<Result<T>>;

type BackgroundTask<T> = {
  isBackgroundTask: true;
  factory: TaskFactory<T>;
};

/**
 * A queue for backgrounding tasks without hammering servers too much.
 */
export class ThrottlingQueue {
  /**
   * The pending tasks.
   */
  private _tasks: BackgroundTask<unknown>[] | null = [];

  /**
   * A timeout for the next task to execute.
   */
  private timeout: ReturnType<typeof setTimeout> | null;

  /**
   * Construct an empty queue.
   *
   * This queue will start executing whenever `push()` is called and stop
   * whenever it runs out of tasks to execute.
   *
   * @param delayMS The default delay between executing two tasks, in ms.
   */
  constructor(
    private managementRoomOutput: ManagementRoomOutput,
    /**
     * How long we should wait between the completion of a tasks and the start of the next task.
     * Any >=0 number is good.
     */
    private delayMS: number
  ) {
    this.timeout = null;
    this.delayMS = delayMS;
    this._tasks = [];
  }

  /**
   * Stop the queue, make sure we can never use it again.
   */
  public dispose() {
    this.stop();
    this._tasks = null;
  }

  /**
   * The number of tasks waiting to be executed.
   */
  get length(): number {
    return this.tasks.length;
  }

  /**
   * Push a new task onto the queue.
   *
   * @param task Some code to execute.
   */
  public push<T>(task: TaskFactory<T>): void {
    this.tasks.push({ isBackgroundTask: true, factory: task });
    this.start();
  }

  /**
   * Block a queue for a number of milliseconds.
   *
   * This method is meant typically to be used by a `Task` that receives a 429 (Too Many Requests) to reschedule
   * itself for later, after giving the server a little room to breathe. If you need this, do not forget to
   * re-`push()` with the failing `Task`. You may call `block()` and `push()` in either order.
   *
   * @param durationMS A number of milliseconds to wait until resuming operations.
   */
  public block(durationMS: number) {
    this.stop();
    this.timeout = setTimeout(() => {
      void this.step();
    }, durationMS);
  }

  /**
   * Start the loop to execute pending tasks.
   *
   * Does nothing if the loop is already started.
   */
  private start() {
    if (this.timeout) {
      // Already started.
      return;
    }
    if (!this.tasks.length) {
      // Nothing to do.
      return;
    }
    this.timeout = setTimeout(() => {
      void this.step();
    }, this.delayMS);
  }

  /**
   * Stop the loop to execute pending tasks.
   *
   * Does nothing if the loop is already stopped. A loop stopped with `stop()` may be
   * resumed by calling `push()` or `start()`.
   */
  private stop() {
    if (!this.timeout) {
      // Already stopped.
      return;
    }
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  /**
   * Change the delay between completion of an event and the start of the next event.
   *
   * This will be used next time a task is completed.
   */
  public setDelayMS(delayMS: number) {
    if (delayMS < 0) {
      throw new TypeError(
        `Invalid delay ${delayMS}. Need a non-negative number of ms.`
      );
    }
    this.delayMS = delayMS;
  }

  /**
   * Execute one step of the loop, then prepare the following step.
   *
   * 1. If there is no task, do nothing and stop.
   * 2. Otherwise, execute task.
   * 3. Once task is complete (whether succeeded or failed), retrigger the loop.
   */
  private async step() {
    // Pull task.
    const task = this.tasks.shift();
    if (!task) {
      // Nothing to do.
      // Stop the loop until we have something to do.
      this.stop();
      return;
    }
    const result = await task.factory();
    if (isError(result)) {
      await this.managementRoomOutput.logMessage(
        LogLevel.ERROR,
        "Error while executing task",
        result.error.toReadableString()
      );
    }
    this.stop();
    this.start();
  }

  /**
   * Return `tasks`, unless the queue has been disposed of.
   */
  private get tasks(): BackgroundTask<unknown>[] {
    if (this._tasks === null) {
      throw new TypeError(
        "This Throttling Queue has been disposed of and shouldn't be used anymore"
      );
    }
    return this._tasks;
  }
}
