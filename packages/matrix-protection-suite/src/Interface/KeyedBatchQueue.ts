// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import { Task } from "./Task";
import { Logger } from "../Logging/Logger";
import { ActionException, ActionExceptionKind } from "./ActionException";

const log = new Logger("KeyedBatchQueue");

export type KeyedBatchRequest<Value extends string = string> = {
  value: Value;
  resolve: (result: Result<void>) => void;
};

export type KeyedBatchProcessor<
  Key extends string = string,
  Value extends string = string,
> = (key: Key, batchedValues: Value[]) => Promise<Result<void>>;

export class KeyedBatchQueue<
  Key extends string = string,
  Value extends string = string,
> {
  // Queue of pending requests per room
  private queues: Map<Key, KeyedBatchRequest<Value>[]> = new Map();

  // A "lock" flag: which rooms are actively being processed
  private processing: Set<Key> = new Set();

  constructor(private batchProcessor: KeyedBatchProcessor<Key, Value>) {}

  enqueue(key: Key, value: Value): Promise<Result<void>> {
    return new Promise<Result<void>>((resolve) => {
      const request: KeyedBatchRequest<Value> = { value, resolve };

      const entry = this.queues.get(key);
      if (entry === undefined) {
        this.queues.set(key, []);
      } else {
        entry.push(request);
      }

      // Try to start processing this room's queue
      this.maybeProcess(key);
    });
  }

  private maybeProcess(key: Key): void {
    // If this room is already being processed, just wait.
    if (this.processing.has(key)) return;

    // Mark the room as "locked"
    this.processing.add(key);
    void Task(this.flush(key));
  }

  private async flush(key: Key): Promise<void> {
    const requests = this.queues.get(key) ?? [];
    if (requests.length === 0) {
      this.processing.delete(key);
      return;
    }

    // Take the current batch out of the queue
    this.queues.set(key, []);
    const values = [...new Set(requests.map((r) => r.value))];

    try {
      const processResult = await this.batchProcessor(key, values);
      for (const request of requests) {
        request.resolve(processResult);
      }
    } catch (error) {
      log.error("Uncaught error in batch processor", error);
      if (error instanceof Error) {
        const errorResult = ActionException.Result(
          "Uncaught error in batch processor",
          {
            exception: error,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        );
        for (const request of requests) {
          request.resolve(errorResult);
        }
      } else {
        throw error; // we don't know wth this is.
      }
    } finally {
      // Unlock this room
      this.processing.delete(key);

      // If new requests came in while we were processing, schedule another flush
      if ((this.queues.get(key)?.length ?? 0) > 0) {
        this.maybeProcess(key);
      }
    }
  }
}
