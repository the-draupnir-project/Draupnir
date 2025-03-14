// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Logger, Task } from "matrix-protection-suite";

type BlockingResponse =
  | "NOT_SPAM"
  | {
      errcode: string;
      error: string;
    };

const log = new Logger("SpamCheckEndpointPluginManager");

export type BlockingCallback<CBArguments extends unknown[]> = (
  ...args: CBArguments
) => Promise<BlockingResponse>;
export type NonBlockingCallback<CBArguments extends unknown[]> = (
  ...args: CBArguments
) => void;

export class SpamCheckEndpointPluginManager<CBArguments extends unknown[]> {
  private readonly blockingHandles = new Set<BlockingCallback<CBArguments>>();
  private readonly nonBlockingHandles = new Set<
    NonBlockingCallback<CBArguments>
  >();

  public registerBlockingHandle(handle: BlockingCallback<CBArguments>): void {
    this.blockingHandles.add(handle);
  }

  public registerNonBlockingHandle(
    handle: NonBlockingCallback<CBArguments>
  ): void {
    this.nonBlockingHandles.add(handle);
  }

  public unregisterHandle(
    handle: BlockingCallback<CBArguments> | NonBlockingCallback<CBArguments>
  ): void {
    this.blockingHandles.delete(handle as BlockingCallback<CBArguments>);
    this.nonBlockingHandles.delete(handle as NonBlockingCallback<CBArguments>);
  }

  public unregisterListeners(): void {
    this.blockingHandles.clear();
    this.nonBlockingHandles.clear();
  }

  public isBlocking(): boolean {
    return this.blockingHandles.size > 0;
  }

  public async callBlockingHandles(
    ...args: CBArguments
  ): ReturnType<BlockingCallback<CBArguments>> {
    const results = await Promise.allSettled(
      [...this.blockingHandles.values()].map((handle) => handle(...args))
    );
    for (const result of results) {
      if (result.status === "rejected") {
        log.error(
          "Error processing a blocking spam check callback:",
          result.reason
        );
      } else {
        if (result.value !== "NOT_SPAM") {
          return result.value;
        }
      }
    }
    return "NOT_SPAM";
  }

  public callNonBlockingHandles(...args: CBArguments): void {
    for (const handle of this.nonBlockingHandles) {
      try {
        handle(...args);
      } catch (e) {
        log.error("Error processing a non blocking spam check callback:", e);
      }
    }
  }

  public callNonBlockingHandlesInTask(...args: CBArguments): void {
    void Task(
      (async () => {
        this.callNonBlockingHandles(...args);
      })()
    );
  }
}
