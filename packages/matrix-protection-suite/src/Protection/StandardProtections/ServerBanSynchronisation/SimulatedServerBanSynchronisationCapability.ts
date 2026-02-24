// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok } from "@gnuxie/typescript-result";
import { randomEventID } from "../../../TestUtilities/EventGeneration";
import { RoomStateEventSender } from "../../../Client/RoomStateEventSender";
import { ServerBanSynchronisationCapability } from "./ServerBanSynchronisationCapability";
import {
  Capability,
  describeCapabilityProvider,
} from "../../Capability/CapabilityProvider";
import {
  ServerACLSynchronisationCapability,
  ServerACLSynchronisationCapabilityContext,
} from "./ServerACLSynchronisationCapability";
import { ProtectedRoomsSet } from "../../ProtectedRoomsSet";

const FakeStateSender = Object.freeze({
  sendStateEvent(_room, _stateType, _stateKey, _content) {
    return Promise.resolve(Ok(randomEventID()));
  },
} satisfies RoomStateEventSender);

export class SimulatedServerBanSynchronisationCapability
  implements ServerBanSynchronisationCapability, Capability
{
  public readonly requiredPermissions = [];
  public readonly requiredEventPermissions = [];
  public readonly requiredStatePermissions = [];
  public readonly isSimulated = true;
  private readonly simulatedCapability;
  public readonly outcomeFromIntentInRoom;
  public readonly outcomeFromIntentInRoomSet;
  public constructor(private readonly protectedRoomsSet: ProtectedRoomsSet) {
    this.simulatedCapability = new ServerACLSynchronisationCapability(
      FakeStateSender,
      this.protectedRoomsSet
    );
    this.outcomeFromIntentInRoom =
      this.simulatedCapability.outcomeFromIntentInRoom.bind(
        this.simulatedCapability
      );
    this.outcomeFromIntentInRoomSet =
      this.simulatedCapability.outcomeFromIntentInRoomSet.bind(
        this.simulatedCapability
      );
  }
}

describeCapabilityProvider({
  name: "SimulatedServerBanSynchronisationCapability",
  description:
    "Simulates banning servers in protected rooms, but has no real effects",
  interface: "ServerBanSynchronisationCapability",
  isSimulated: true,
  factory(_description, context: ServerACLSynchronisationCapabilityContext) {
    return new SimulatedServerBanSynchronisationCapability(
      context.protectedRoomsSet
    );
  },
});
