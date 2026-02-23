// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { PolicyRuleChange, RoomBasicDetails } from "matrix-protection-suite";
import { RoomToCheck } from "./DiscoveredRoomStore";
import { Result } from "@gnuxie/typescript-result";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";

// FIXME: This should really have its own "Room acknowledged" table in the audit log...
//        which only sends when a notification has been sent to the admin room.
//        This would allow for complete coverage...

export type RoomDiscoveryListener = (details: RoomBasicDetails) => void;

export interface RoomDiscovery {
  on(event: "RoomDiscovery", listener: RoomDiscoveryListener): this;
  off(event: "RoomDiscovery", listener: RoomDiscoveryListener): this;
  emit(event: "RoomDiscovery", details: RoomBasicDetails): void;
  checkRoomsDiscovered(
    roomsToCheck: RoomToCheck[]
  ): Promise<Result<RoomBasicDetails[]>>;
  /** FIXME: I do not like that this is exposed */
  isRoomDiscovered(roomID: StringRoomID): boolean;
}

export interface RoomExplorer {
  handlePolicyChange(change: PolicyRuleChange[]): void;
  unregisterListeners(): void;
}
