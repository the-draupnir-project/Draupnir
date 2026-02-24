// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { Logger } from "../Logging/Logger";

const log = new Logger("Lifetime");

export type LifetimeDisposeHandle<Owner = unknown> =
  | OwnLifetime<Owner>
  | (() => void | Promise<void>)
  | Disposable;

export interface Lifetime<Owner = unknown> {
  isInDisposal(): boolean;
  toChild<Child = unknown>(): Result<OwnLifetime<Child>>;
  forget(callback: LifetimeDisposeHandle<Owner>): this;
  forgetAndDispose(callback: LifetimeDisposeHandle<Owner>): Promise<void>;
}

export type Disposable =
  | { [Symbol.dispose](): void }
  | { [Symbol.asyncDispose](): Promise<void> };

export interface AllocatableLifetime<Owner = unknown> extends Lifetime<Owner> {
  allocateResource<T>(
    factory: (lifetime: AllocatableLifetime<Owner>) => Result<T>,
    disposer: (resource: T) => LifetimeDisposeHandle<Owner>
  ): Result<T>;

  allocateDisposable<TDisposable extends Disposable>(
    factory: (lifetime: AllocatableLifetime<Owner>) => Result<TDisposable>
  ): Result<TDisposable>;

  allocateResourceAsync<T>(
    factory: (lifetime: AllocatableLifetime<Owner>) => Promise<Result<T>>,
    disposer: (resource: T) => LifetimeDisposeHandle<Owner>
  ): Promise<Result<T>>;

  allocateDisposableAsync<TDisposable extends Disposable>(
    factory: (
      lifetime: AllocatableLifetime<Owner>
    ) => Promise<Result<TDisposable>>
  ): Promise<Result<TDisposable>>;

  toAbortSignal(): AbortSignal;

  onDispose(callback: LifetimeDisposeHandle<Owner>): this;
}

/**
 * Lifetime is an abstraction that provides structured ownership, cancellation,
 * and cleanup of resources.
 *
 * The Lifetime can also be used to cancel asynchronous operations, such as IO,
 * timeouts, or lock acquisition.
 *
 * We also offer compatibility with `AbortSignal` which allows the Lifetime
 * to be used directly with APIs that support AbortSignal instead. Note:
 * AbortSignal does not support awaiting for cleanup to finish.
 *
 * The lifetime is used to make it impossible to forget to handle dispose methods.
 * Anything that has a dispose method should be allocated against a lifetime.
 * When constructors or factories ask for a lifetime, they will allocate their
 * own resources against this lifetime. However, if the object being constructed
 * also has a dispose method. You will still need to allocate the object created
 * by the factory against a parent lifetime.
 *
 * Lifecycle:
 * - [Symbol.asyncDispose] must be called to dispose the object.
 * - Resources MUST register with a Lifetime atomically as a part of resource
 *   allocation. Resources MUST fail to allocate if the Lifetime is already in disposal.
 *   Use allocateResource.
 *
 */
export interface OwnLifetime<
  Owner = unknown,
> extends AllocatableLifetime<Owner> {
  /**
   * We specifically provide a contract that this method will only exit
   * when all resources have cleaned up. And it is not possible to allocate
   * new resources once disposal has started.
   */
  [Symbol.asyncDispose](): Promise<void>;
}

export type LifetimeOptions = {
  // parent is always unknown, otherwise it is anti-modular.
  readonly parent?: AllocatableLifetime;
};

async function callDisposeHandle(handle: LifetimeDisposeHandle): Promise<void> {
  if (typeof handle === "function") {
    await handle();
  } else if (Symbol.dispose in handle) {
    handle[Symbol.dispose]();
  } else {
    await handle[Symbol.asyncDispose]();
  }
}

export class StandardLifetime<Owner = unknown> implements OwnLifetime<Owner> {
  private readonly controller = new AbortController();
  private readonly callbacks = new Set<LifetimeDisposeHandle<Owner>>();
  private readonly disposedPromise: Promise<void>;
  private resolveDisposed: undefined | (() => void) = undefined;
  private readonly parent: AllocatableLifetime | undefined;

  public constructor(options: LifetimeOptions = {}) {
    this.parent = options.parent;
    this.parent?.onDispose(this);
    this.disposedPromise = new Promise((resolve) => {
      this.resolveDisposed = resolve;
    });
  }

  public isInDisposal() {
    return this.controller.signal.aborted;
  }

  public onDispose(callback: LifetimeDisposeHandle<Owner>): this {
    if (this.isInDisposal()) {
      throw new TypeError(
        "You are registering a resource with the Lifetime non atomically. You must only register resources immediately and atomically with resource allocation. Use the allocateResource method."
      );
    } else {
      this.callbacks.add(callback);
      return this;
    }
  }

  public forget(callback: LifetimeDisposeHandle<Owner>): this {
    // we don't want to delete something we are in the process of disposing.
    if (this.isInDisposal()) {
      return this;
    }
    this.callbacks.delete(callback);
    return this;
  }

  public async forgetAndDispose(
    callback: LifetimeDisposeHandle<Owner>
  ): Promise<void> {
    if (this.isInDisposal()) {
      await this.disposedPromise;
      return;
    }
    this.forget(callback);
    await callDisposeHandle(callback);
  }

  public toAbortSignal(): AbortSignal {
    return this.controller.signal;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.isInDisposal()) {
      return this.disposedPromise;
    }
    this.controller.abort();
    for (const callback of this.callbacks) {
      try {
        await callDisposeHandle(callback);
      } catch (error) {
        log.error("Error during disposal callback", error);
      }
    }
    this.callbacks.clear();
    this.parent?.forget(this);
    if (this.resolveDisposed === undefined) {
      // It's possible that dispose has been called when there are no callbacks.
      // If we process this in the next tick the resolver should have been
      // assigned by that point.
      return new Promise((resolve, reject) => {
        if (this.resolveDisposed === undefined) {
          reject(
            new TypeError(
              "resolveDisposed is undefined during disposal. This should not be possible."
            )
          );
          return;
        } else {
          this.resolveDisposed();
          resolve();
        }
      });
    }
    this.resolveDisposed();
  }

  public toChild<Child = unknown>(): Result<OwnLifetime<Child>> {
    return this.allocateResource(
      () => Ok(new StandardLifetime<Child>({ parent: this })),
      (child) => child
    );
  }

  allocateResource<T>(
    factory: (lifetime: AllocatableLifetime<Owner>) => Result<T>,
    disposer: (resource: T) => LifetimeDisposeHandle<Owner>
  ): Result<T> {
    if (this.isInDisposal()) {
      return ResultError.Result(
        "Resource was not initialized: Lifetime is in disposal. Use isInDisposal to check before using this method."
      );
    }
    const resource = factory(this);
    if (isError(resource)) {
      return resource;
    }
    this.onDispose(disposer(resource.ok));
    return resource;
  }

  allocateDisposable<TDisposable extends Disposable>(
    factory: (lifetime: AllocatableLifetime<Owner>) => Result<TDisposable>
  ): Result<TDisposable> {
    return this.allocateResource(factory, (resource) => resource);
  }

  async withDisposalBlocked<T>(
    cb: () => Promise<Result<T>>
  ): Promise<Result<T>> {
    if (this.isInDisposal()) {
      return ResultError.Result(
        "Lifetime is in disposal, so disposal cannot be blocked"
      );
    }
    const blockingPromise = cb();
    const handle = () => blockingPromise.then(() => {});
    this.onDispose(handle);
    try {
      return await blockingPromise;
    } finally {
      this.forget(handle);
    }
  }

  async allocateResourceAsync<T>(
    factory: (lifetime: AllocatableLifetime<Owner>) => Promise<Result<T>>,
    disposer: (resource: T) => LifetimeDisposeHandle<Owner>
  ): Promise<Result<T>> {
    return await this.withDisposalBlocked(async () => {
      const resource = await factory(this);
      if (isError(resource)) {
        return resource;
      }
      if (this.isInDisposal()) {
        await callDisposeHandle(disposer(resource.ok));
        return ResultError.Result(
          "Resource had to be disposed after allocation because Lifetime entered disposal"
        );
      } else {
        this.onDispose(disposer(resource.ok));
        return resource;
      }
    });
  }

  async allocateDisposableAsync<TDisposable extends Disposable>(
    factory: (
      lifetime: AllocatableLifetime<Owner>
    ) => Promise<Result<TDisposable>>
  ): Promise<Result<TDisposable>> {
    return await this.allocateResourceAsync(factory, (resource) => resource);
  }
}
