// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { EventDecoder, SHA256HashStore } from "matrix-protection-suite";
import { RoomAuditLog } from "../protections/RoomTakedown/RoomAuditLog";
import { SqliteRoomStateBackingStore } from "./better-sqlite3/SqliteRoomStateBackingStore";
import { SqliteHashReversalStore } from "./better-sqlite3/HashStore";
import { SqliteRoomAuditLog } from "../protections/RoomTakedown/SqliteRoomAuditLog";
import { UserRestrictionAuditLog } from "../protections/HomeserverUserPolicyApplication/UserRestrictionAuditLog";
import { SqliteUserRestrictionAuditLog } from "../protections/HomeserverUserPolicyApplication/SqliteUserRestrictionAuditLog";

export type TopLevelStores = {
  hashStore?: SHA256HashStore;
  roomAuditLog?: RoomAuditLog | undefined;
  roomStateBackingStore?: SqliteRoomStateBackingStore | undefined;
  userRestrictionAuditLog?: UserRestrictionAuditLog | undefined;
  dispose(): void;
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
  hashStore?: SHA256HashStore | undefined;
  roomAuditLog?: RoomAuditLog | undefined;
  userRestrictionAuditLog?: UserRestrictionAuditLog | undefined;
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
    roomAuditLog: topLevelStores.roomAuditLog,
    hashStore: topLevelStores.hashStore,
    userRestrictionAuditLog: topLevelStores.userRestrictionAuditLog,
    dispose() {},
  } satisfies DraupnirStores);
}

export function makeTopLevelStores(
  storagePath: string,
  eventDecoder: EventDecoder,
  {
    isRoomStateBackingStoreEnabled,
  }: { isRoomStateBackingStoreEnabled: boolean }
): TopLevelStores {
  return Object.freeze({
    roomStateBackingStore: isRoomStateBackingStoreEnabled
      ? SqliteRoomStateBackingStore.create(storagePath, eventDecoder)
      : undefined,
    hashStore: SqliteHashReversalStore.createToplevel(storagePath),
    roomAuditLog: SqliteRoomAuditLog.createToplevel(storagePath),
    userRestrictionAuditLog:
      SqliteUserRestrictionAuditLog.createToplevel(storagePath),
    dispose() {
      this.roomStateBackingStore?.destroy();
      this.hashStore?.destroy();
      this.roomAuditLog?.destroy();
      this.userRestrictionAuditLog?.destroy();
    },
  } satisfies TopLevelStores);
}
