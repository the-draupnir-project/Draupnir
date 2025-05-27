// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

export interface LeakyBucket<Key> {
  /**
   * Return the token count.
   */
  addToken(key: Key): number;
  getTokenCount(key: Key): number;
  getAllTokens(): Map<Key, number>;
  stop(): void;
}

type BucketEntry = {
  tokens: number;
  lastLeak: Date;
};

/**
 * A lazy version of the bucket to be used when the throughput is really
 * low most of the time, so doesn't warrant constant filling/leaking.
 *
 * This won't be good to use in a high throughput situation because
 * of the way it will spam calling for the current time.
 */
export class LazyLeakyBucket<Key> implements LeakyBucket<Key> {
  private readonly buckets: Map<Key, BucketEntry> = new Map();
  private readonly leakDelta: number;
  private isDisposed = false;
  private leakCycleTimeout: NodeJS.Timeout | null = null;

  public constructor(
    private readonly capacity: number,
    private readonly timescale: number
  ) {
    this.leakDelta = this.timescale / this.capacity;
    this.startLeakCycle();
  }
  getAllTokens(): Map<Key, number> {
    const map = new Map<Key, number>();
    for (const key of this.buckets.keys()) {
      map.set(key, this.getTokenCount(key));
    }
    return map;
  }

  private leak(now: Date, key: Key, entry: BucketEntry): void {
    const elapsed = now.getTime() - entry.lastLeak.getTime();
    const tokensToRemove = Math.floor(elapsed / this.timescale);
    entry.tokens = Math.max(entry.tokens - tokensToRemove, 0);
    entry.lastLeak = new Date(
      entry.lastLeak.getTime() + tokensToRemove * this.leakDelta
    );
    if (entry.tokens < 1) {
      this.buckets.delete(key);
    }
  }

  public addToken(key: Key): number {
    const now = new Date();
    const entry = this.buckets.get(key);
    if (entry === undefined) {
      this.buckets.set(key, {
        tokens: 1,
        lastLeak: now,
      });
      return 1;
    }
    entry.tokens += 1;
    this.leak(now, key, entry);
    return entry.tokens;
  }

  public getTokenCount(key: Key): number {
    const now = new Date();
    const entry = this.buckets.get(key);
    if (entry === undefined) {
      return 0;
    }
    this.leak(now, key, entry);
    return entry.tokens;
  }

  private leakAll(): void {
    const now = new Date();
    for (const [key, entry] of this.buckets.entries()) {
      this.leak(now, key, entry);
    }
  }

  /**
   * Periodically leak all of the buckets to prevent memory leaks from leftover
   * keys.
   */
  private startLeakCycle(): void {
    if (this.isDisposed) {
      return;
    }
    this.leakCycleTimeout = setTimeout(() => {
      this.leakAll();
      this.startLeakCycle();
    }, this.timescale);
  }

  public stop(): void {
    this.isDisposed = true;
    if (this.leakCycleTimeout) {
      clearTimeout(this.leakCycleTimeout);
    }
  }
}
