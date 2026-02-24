// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

/**
 * Exposes a single method to check whether a key is a duplicate (has this event been seen before?).
 * If the key is unique, the next time the mehod is called it will mark the key as a duplicate.
 *
 */
export interface Deduplicator<Key> {
  /**
   * If the deduplicator hasn't seen the key before, then the key is not a duplicate.
   * If the deduplicator has seen the key before, then the key is a duplicate.
   * Once a key has been given to the method, it will be marked as a duplicate.
   */
  isDuplicate(key: Key): boolean;
}

export class StandardDeduplicator<Key> implements Deduplicator<Key> {
  private readonly keySet = new Set<Key>();
  private readonly queue: Key[] = [];
  private readonly queueMaxSize: number;

  public constructor(queueMaxSize?: number) {
    this.queueMaxSize = queueMaxSize ?? 32;
  }

  isDuplicate(key: Key): boolean {
    if (this.keySet.has(key)) {
      return true;
    }
    if (this.queue.length === this.queueMaxSize) {
      const keyToRemove = this.queue.shift();
      if (keyToRemove === undefined) {
        throw new TypeError(`The keyToRemove should not be undefined`);
      }
      this.keySet.delete(keyToRemove);
    }
    this.keySet.add(key);
    this.queue.push(key);
    return false;
  }
}
