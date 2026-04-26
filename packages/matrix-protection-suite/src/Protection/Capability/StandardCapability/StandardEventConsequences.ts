// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringRoomID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";
import { PowerLevelPermission } from "../../../Client/PowerLevelsMirror";
import { RoomEventRedacter } from "../../../Client/RoomEventRedacter";
import { ActionResult, Ok, isError } from "../../../Interface/Action";
import { describeCapabilityProvider } from "../CapabilityProvider";
import { EventConsequences } from "./EventConsequences";
import "./EventConsequences"; // we need this so the interface is loaded.

export class StandardEventConsequences implements EventConsequences {
  requiredPermissions = [PowerLevelPermission.Redact];
  requiredEventPermissions = [];
  requiredStatePermissions = [];
  public constructor(private readonly eventRedacter: RoomEventRedacter) {
    // nothing to do.
  }

  public async consequenceForEvent(
    roomID: StringRoomID,
    eventID: StringEventID,
    reason: string
  ): Promise<ActionResult<void>> {
    const result = await this.eventRedacter.redactEvent(
      roomID,
      eventID,
      reason
    );
    if (isError(result)) {
      return result;
    } else {
      return Ok(undefined);
    }
  }
}

describeCapabilityProvider({
  name: "StandardEventConsequences",
  description:
    "Issues m.room.redaction at the room level against the target event.",
  interface: "EventConsequences",
  factory(_description, context: { eventRedacter: RoomEventRedacter }) {
    return new StandardEventConsequences(context.eventRedacter);
  },
});
