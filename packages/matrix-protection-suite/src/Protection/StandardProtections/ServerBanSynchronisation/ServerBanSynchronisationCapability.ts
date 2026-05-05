// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { Capability } from "../../Capability/CapabilityProvider";
import { ServerBanIntentProjection } from "./ServerBanIntentProjection";
import { Result } from "@gnuxie/typescript-result";
import { RoomSetResult } from "../../Capability/StandardCapability/RoomSetResult";
import { CapabilityMethodSchema } from "../../Capability/StandardCapability/CapabilityMethodSchema";
import { Type } from "@sinclair/typebox";
import { describeCapabilityInterface } from "../../Capability/CapabilityInterface";

export interface ServerBanSynchronisationCapability extends Capability {
  /**
   * Apply the server ban intent projection to a single room.
   * @returns true if there was any effect
   */
  outcomeFromIntentInRoom(
    roomID: StringRoomID,
    intentProjection: ServerBanIntentProjection
  ): Promise<Result<boolean>>;

  outcomeFromIntentInRoomSet(
    intentProjection: ServerBanIntentProjection
  ): Promise<Result<RoomSetResult>>;
}

export const ServerBanSynchronisationCapability = Type.Intersect([
  Type.Object({
    outcomeFromIntentInRoom: CapabilityMethodSchema,
    outcomeFromIntentInRoomSet: CapabilityMethodSchema,
  }),
  Capability,
]);

describeCapabilityInterface({
  name: "ServerBanSynchronisationCapability",
  description: "Capability used by the ServerBanSynchronisationProtection",
  schema: ServerBanSynchronisationCapability,
});
