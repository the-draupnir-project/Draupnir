// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result } from "@gnuxie/typescript-result";
import { RoomEventRedacter } from "../../../Client/RoomEventRedacter";
import { Capability, describeCapabilityProvider } from "../CapabilityProvider";
import { EventConsequences } from "./EventConsequences";
import { StandardEventConsequences } from "./StandardEventConsequences";
import { randomEventID } from "../../../TestUtilities/EventGeneration";
import {
  StringRoomID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";

const FakeEventRedacter = Object.freeze({
  redactEvent(_room, _eventID, _reason) {
    return Promise.resolve(Ok(randomEventID()));
  },
} satisfies RoomEventRedacter);

export class SimulatedEventConsequences
  implements EventConsequences, Capability
{
  public readonly requiredPermissions = [];
  public readonly requiredEventPermissions = [];
  public readonly requiredStatePermissions = [];
  public readonly isSimulated = true;
  private readonly simulatedCapability = new StandardEventConsequences(
    FakeEventRedacter
  );

  public async consequenceForEvent(
    roomID: StringRoomID,
    eventID: StringEventID,
    reason: string
  ): Promise<Result<void>> {
    return await this.simulatedCapability.consequenceForEvent(
      roomID,
      eventID,
      reason
    );
  }
}

describeCapabilityProvider({
  name: "SimulatedEventConsequences",
  description:
    "Simulates redacting events in protected rooms, but has no real effects",
  interface: "EventConsequences",
  isSimulated: true,
  factory(_description, _context) {
    return new SimulatedEventConsequences();
  },
});
