// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  SHA256RoomHashStore,
  StandardSHA256RoomHashStore,
} from "matrix-protection-suite";
import { RoomAuditLog } from "../protections/RoomTakedown/RoomAuditLog";

export type TopLevelStores = {
  hashStore?: Omit<SHA256RoomHashStore, "on" | "off">;
  roomAuditLog?: RoomAuditLog;
};

/**
 * These stores will usually be created at the entrypoint of the draupnir
 * application or attenuated for each draupnir.
 *
 * No i don't like it. Some of these stores ARE specific to the draupnir
 * such as the hasStore's event emitter... that just can't be mixed.
 *
 * We could create a wrapper that disposes of only the stores that
 * have been attenuated... but i don't know about it.
 */
export type DraupnirStores = {
  hashStore?: SHA256RoomHashStore | undefined;
  roomAuditLog?: RoomAuditLog | undefined;
  /**
   * Dispose of stores relevant to a specific draupnir instance.
   * For example, the hash store is usually specific to a single draupnir.
   */
  dispose(): void;
};

export function createDraupnirStores(
  topLevelStores: TopLevelStores
): DraupnirStores {
  return Object.freeze({
    roomAudditLog: topLevelStores.roomAuditLog,
    hashStore: topLevelStores.hashStore
      ? new StandardSHA256RoomHashStore(topLevelStores.hashStore)
      : undefined,
    dispose() {},
  });
}
