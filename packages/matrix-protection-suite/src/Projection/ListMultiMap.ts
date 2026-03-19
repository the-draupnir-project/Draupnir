// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Map as PersistentMap, List } from "immutable";

export type ListMultiMap<Key, Value> = PersistentMap<Key, List<Value>>;
type GetKeyFromValue<Key, Value> = (value: Value) => Key;
export const ListMultiMap = Object.freeze({
  add<Key, Value>(
    map: ListMultiMap<Key, Value>,
    key: Key,
    value: Value
  ): ListMultiMap<Key, Value> {
    const existing = map.get(key, List<Value>());
    return map.set(key, existing.push(value));
  },

  remove<Key, Value>(
    map: ListMultiMap<Key, Value>,
    key: Key,
    value: Value
  ): ListMultiMap<Key, Value> {
    const existing = map.get(key, List<Value>());
    const updated = existing.filter((item) => item !== value);
    return updated.size === 0 ? map.delete(key) : map.set(key, updated);
  },

  removeValues<Key, Value>(
    map: ListMultiMap<Key, Value>,
    remove: Value[],
    getKeyFromValue: GetKeyFromValue<Key, Value>
  ): ListMultiMap<Key, Value> {
    let next = map;
    for (const item of remove) {
      next = this.remove(next, getKeyFromValue(item), item);
    }
    return next;
  },

  addValues<Key, Value>(
    map: ListMultiMap<Key, Value>,
    add: Value[],
    getKeyFromValue: GetKeyFromValue<Key, Value>
  ): ListMultiMap<Key, Value> {
    let next = map;
    for (const item of add) {
      next = this.add(next, getKeyFromValue(item), item);
    }
    return next;
  },

  deriveIntents<Key, Value>(
    map: ListMultiMap<Key, Value>,
    add: Value[],
    remove: Value[],
    getKeyFromValue: GetKeyFromValue<Key, Value>
  ): {
    intend: Key[];
    recall: Key[];
  } {
    const output: { intend: Key[]; recall: Key[] } = { intend: [], recall: [] };
    type Change = { valueCount: number; introduced?: boolean };
    const projectedChanges = new Map<Key, Change>();
    const accessChanges = (key: Key): Change =>
      projectedChanges.get(key) ??
      ((existing) => ({
        valueCount: existing ?? 0,
        introduced: existing === undefined,
      }))(map.get(key)?.size);
    for (const value of add) {
      projectedChanges.set(
        getKeyFromValue(value),
        ((change) => ((change.valueCount += 1), change))(
          accessChanges(getKeyFromValue(value))
        )
      );
    }
    for (const value of remove) {
      projectedChanges.set(
        getKeyFromValue(value),
        ((change) => ((change.valueCount -= 1), change))(
          accessChanges(getKeyFromValue(value))
        )
      );
    }
    for (const [key, change] of projectedChanges) {
      if (change.introduced && change.valueCount > 0) {
        output.intend.push(key);
      } else if (change.valueCount === 0) {
        output.recall.push(key);
      } else if (change.valueCount < 0) {
        throw new TypeError("Things are super wrong");
      }
    }
    return output;
  },

  empty<Key, Value>(): ListMultiMap<Key, Value> {
    return PersistentMap<Key, List<Value>>();
  },
});
