// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ActionResult, Ok, isOk } from "./Action";

export type CreateInstanceFromKey<
  K,
  V,
  AdditionalCreationArguments extends unknown[],
> = (key: K, ...args: AdditionalCreationArguments) => Promise<ActionResult<V>>;

/**
 * This is a utility for any hash table that needs to create new values
 * from a `key`. The value will then be stored in the table and returned
 * each time the factory is then queried for that key.
 * This is mostly useful for singletons.
 * @typeParam AdditionalCreationArguments These are arguments that need to be
 * given to `createInstanceFromKey` when `getInstance` is called should a new
 * instance need to be created. Usually this would be some context like a matrix
 * client that can be used to fetch information.
 */
export class InternedInstanceFactory<
  K,
  V,
  AdditionalCreationArguments extends unknown[],
> {
  private readonly instances = new Map<K, V>();
  /**
   * If `getInstance` is called concurrently before the factory method that
   * creates the instance has finished, then the factory method could be called
   * multiple times concurrently. To prevent this, we use this map to lock
   * per key when the factory is called.
   */
  private readonly factoryLock = new Map<K, Promise<ActionResult<V>>>();
  /**
   * Constructs the `InternedInstanceFactory`.
   * @param createInstanceFromKey A callable that will create new instances
   * from a key if the table doesn't have an entry for that key.
   */
  public constructor(
    private readonly createInstanceFromKey: CreateInstanceFromKey<
      K,
      V,
      AdditionalCreationArguments
    >
  ) {
    // nothing to do.
  }

  /**
   * Find an instance associated with the key.
   * @param key The key.
   * @param args Any arguments that need to be given to `createInstanceFromKey`
   * that was provided the constructor for `InternedInstanceFactory`.
   * @returns An associated instance for the key.
   */
  public async getInstance(
    key: K,
    ...args: AdditionalCreationArguments
  ): Promise<ActionResult<V>> {
    const instance = this.instances.get(key);
    if (instance !== undefined) {
      return Ok(instance);
    }
    const lock = this.factoryLock.get(key);
    if (lock === undefined) {
      try {
        const factoryCallPromise = this.createInstanceFromKey(key, ...args);
        this.factoryLock.set(key, factoryCallPromise);
        const initialInstanceResult = await factoryCallPromise;
        if (isOk(initialInstanceResult)) {
          this.instances.set(key, initialInstanceResult.ok);
        }
        return initialInstanceResult;
      } finally {
        this.factoryLock.delete(key);
      }
    } else {
      return await lock;
    }
  }

  public hasInstance(key: K): boolean {
    return this.instances.has(key);
  }

  public getStoredInstance(key: K): V | undefined {
    return this.instances.get(key);
  }

  public allInstances(): V[] {
    return [...this.instances.values()];
  }
}
