/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { LogLevel } from "matrix-bot-sdk";
import ManagementRoomOutput from "../ManagementRoomOutput";

export type Task<T> = (queue: ThrottlingQueue) => Promise<T>;

/**
 * A queue for backgrounding tasks without hammering servers too much.
 */
export class ThrottlingQueue {
    /**
     * The pending tasks.
     */
    private _tasks: (() => Promise<void>)[] | null;

    /**
     * A timeout for the next task to execute.
     */
    private timeout: ReturnType<typeof setTimeout> | null;

    /**
     * How long we should wait between the completion of a tasks and the start of the next task.
     * Any >=0 number is good.
     */
    private _delayMS: number;

    /**
     * Construct an empty queue.
     *
     * This queue will start executing whenever `push()` is called and stop
     * whenever it runs out of tasks to execute.
     *
     * @param delayMS The default delay between executing two tasks, in ms.
     */
    constructor(private managementRoomOutput: ManagementRoomOutput, delayMS: number) {
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
     * @return A promise resolved/rejected once `task` is complete.
     */
    public push<T>(task: Task<T>): Promise<T> {
        // Wrap `task` into a `Promise` to inform enqueuer when
        // the task is complete.
        return new Promise((resolve, reject) => {
            const wrapper = async () => {
                try {
                    const result: T = await task(this);
                    resolve(result);
                } catch (ex) {
                    if (ex instanceof Error) {
                        reject(ex);
                    }
                    throw new TypeError(`Some garbage is throwing things that are not Error ${ex}`);
                };
            };
            this.tasks.push(wrapper);
            this.start();
        });
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
        this.timeout = setTimeout(() => { void this.step() }, durationMS);
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
        this.timeout = setTimeout(() => { void this.step() }, this._delayMS);
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
    set delayMS(delayMS: number) {
        if (delayMS < 0) {
            throw new TypeError(`Invalid delay ${delayMS}. Need a non-negative number of ms.`);
        }
        this._delayMS = delayMS;
    }

    /**
     * Return the delay between completion of an event and the start of the next event.
     */
    get delayMS(): number {
        return this._delayMS;
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
        try {
            await task();
        } catch (ex) {
            await this.managementRoomOutput.logMessage(
                LogLevel.WARN,
                'Error while executing task',
                ex
            );
        } finally {
            this.stop();
            this.start();
        }
    }

    /**
     * Return `tasks`, unless the queue has been disposed of.
     */
    private get tasks(): (() => Promise<void>)[] {
        if (this._tasks === null) {
            throw new TypeError("This Throttling Queue has been disposed of and shouldn't be used anymore");
        }
        return this._tasks;
    }
}
