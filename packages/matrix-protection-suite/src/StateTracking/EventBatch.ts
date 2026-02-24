// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { StringEventID } from "@the-draupnir-project/matrix-basic-types";
import { Logger } from "../Logging/Logger";

const log = new Logger("EventBatch");

function logBatchCompleteCallbackError(e: unknown): void {
  log.error("Caught an exception from the callback for an event batch", e);
}

export interface Batcher<Key extends string, Value> {
  add(key: Key, value: Value): void;
  dispose(): void;
}

export class StandardBatcher<Key extends string, Value> implements Batcher<
  Key,
  Value
> {
  private currentBatch: Batch<Key, Value>;
  public constructor(
    private readonly batchFactoryMethod: () => Batch<Key, Value>
  ) {
    this.currentBatch = batchFactoryMethod();
  }

  public add(key: Key, value: Value): void {
    if (this.currentBatch.isFinished()) {
      this.currentBatch = this.batchFactoryMethod();
    }
    this.currentBatch.add(key, value);
  }

  public dispose(): void {
    if (!this.currentBatch.isFinished()) {
      this.currentBatch.cancel();
    }
  }
}

export interface Batch<Key extends string, Value> {
  add(key: Key, data: Value): void;
  isFinished(): boolean;
  batchCompleteCallback: (entries: [Key, Value][]) => Promise<void>;
  cancel(): void;
}

export class ConstantPeriodItemBatch<
  Key extends string,
  Value,
> implements Batch<Key, Value> {
  private readonly waitPeriodMS: number;
  private items = new Map<Key, Value>();
  private isBatchComplete = false;
  private timeoutID: NodeJS.Timeout | undefined = undefined;
  constructor(
    public readonly batchCompleteCallback: Batch<
      Key,
      Value
    >["batchCompleteCallback"],
    { waitPeriodMS = 200 }
  ) {
    this.waitPeriodMS = waitPeriodMS;
  }

  public isFinished(): boolean {
    return this.isBatchComplete;
  }

  public add(key: Key, item: Value): void {
    if (this.isFinished()) {
      throw new TypeError(
        "Something tried adding an event to a completed EventBatch"
      );
    }
    if (this.items.has(key)) {
      return;
    }
    this.items.set(key, item);
    if (!this.timeoutID) {
      // spawn off the timer to call the callback.
      this.startCallbackTimer();
    }
  }

  private startCallbackTimer(): void {
    if (this.timeoutID) {
      throw new TypeError("The callback timer is being started more than once");
    }
    this.timeoutID = setTimeout(
      this.completeBatch.bind(this),
      this.waitPeriodMS
    );
  }

  private completeBatch(): void {
    this.isBatchComplete = true;
    this.batchCompleteCallback([...this.items.entries()]).catch(
      logBatchCompleteCallbackError
    );
  }

  public cancel(): void {
    if (this.timeoutID) {
      clearTimeout(this.timeoutID);
      this.timeoutID = undefined;
    }
  }
}

type EventWithID = { event_id: StringEventID };

export interface EventBatch<E extends EventWithID = EventWithID> {
  addEvent({ event_id }: E): void;
  isFinished(): boolean;
  batchCompleteCallback: (events: E[]) => Promise<void>;
}

export class ConstantPeriodEventBatch<
  E extends EventWithID = EventWithID,
> implements EventBatch<E> {
  private readonly batch: ConstantPeriodItemBatch<StringEventID, EventWithID>;
  constructor(
    public readonly batchCompleteCallback: EventBatch["batchCompleteCallback"],
    { waitPeriodMS = 200 }
  ) {
    this.batch = new ConstantPeriodItemBatch<StringEventID, EventWithID>(
      (entries) => this.batchCompleteCallback(entries.map((entry) => entry[1])),
      { waitPeriodMS }
    );
  }

  isFinished(): boolean {
    return this.batch.isFinished();
  }

  addEvent(event: E): void {
    this.batch.add(event.event_id, event);
  }
}
