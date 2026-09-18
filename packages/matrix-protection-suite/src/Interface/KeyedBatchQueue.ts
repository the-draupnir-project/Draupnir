// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";
import { Task } from "./Task";
import { Logger } from "../Logging/Logger";
import { ActionException, ActionExceptionKind } from "./ActionException";
import { SemanticType } from "./SemanticType";

const log = new Logger("KeyedBatchQueue");

export type KeyedBatchRequest<Value extends string = string> = {
  value: Value;
  resolve: (result: Result<void>) => void;
};

export type KeyedBatchProcessor<
  Key extends string = string,
  Value extends string = string,
> = (key: Key, batchedValues: Value[]) => Promise<Result<void>>;

export const KeyedBatchQueueSemantics = SemanticType<typeof KeyedBatchQueue>(
  "KeyedBatchQueue"
).declare({
  keyedIsolation: {
    what: "A batch contains values enqueued for exactly one key, and processing for one key does not prevent processing for another key.",
    why: "Keeps unrelated work isolated while allowing independent keys to make progress concurrently.",
  },
  serialProcessingPerKey: {
    what: "At most one batch processor invocation is active for a given key at any time.",
    why: "Prevents concurrent costly operations for the same key from racing or duplicating work.",
  },
  stableBatchBoundaries: {
    what: "Each processor invocation consumes the requests that were pending when its batch began; requests enqueued while it is active belong to a later batch.",
    why: "Gives each processor invocation a stable input and associates every request with processing that included it.",
  },
  automaticFollowUp: {
    what: "Requests enqueued for a key while it is being processed are processed automatically after the active batch settles, without requiring another enqueue operation.",
    why: "Ensures work accepted during processing is not stranded when no further requests arrive.",
  },
  orderedProgressPerKey: {
    what: "Batches for the same key are processed in the order in which their requests became pending.",
    why: "Makes the effects and completion of work for a key predictable.",
  },
  deduplicatedBatchValues: {
    what: "A value appears at most once in a batch processor invocation, even when it was enqueued more than once in that batch.",
    why: "Avoids repeating the same costly work while retaining a completion result for every enqueue request.",
  },
  batchScopedDeduplication: {
    what: "Equal key-value requests are deduplicated only when they belong to the same pending batch. A matching request enqueued after processing begins belongs to a later batch and resolves with that batch's result.",
    why: "An active operation cannot account for work requested after its input was captured, even when the requested value is equal.",
  },
  requestCompletion: {
    what: "Every enqueue promise resolves with the result of the batch processor invocation responsible for its request.",
    why: "Allows each caller to observe when its requested work has finished and whether it succeeded.",
  },
  processorFailureRecovery: {
    what: "An Error thrown by the batch processor is reported as a failed result for every request in that batch, and does not prevent later batches from being processed.",
    why: "Prevents processor failures from leaving callers unresolved or permanently stalling a key.",
  },
});

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
        this.queues.set(key, [request]);
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
