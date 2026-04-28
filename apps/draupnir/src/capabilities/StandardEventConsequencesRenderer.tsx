// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionResult,
  Capability,
  DescriptionMeta,
  EventConsequences,
  RoomEventRedacter,
  describeCapabilityContextGlue,
  describeCapabilityRenderer,
  isError,
} from "matrix-protection-suite";
import { RendererMessageCollector } from "./RendererMessageCollector";
import { Draupnir } from "../Draupnir";
import {
  Permalinks,
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import { renderFailedSingularConsequence } from "@the-draupnir-project/mps-interface-adaptor";

class StandardEventConsequencesRenderer implements EventConsequences {
  constructor(
    private readonly description: DescriptionMeta,
    private readonly messageCollector: RendererMessageCollector,
    private readonly capability: EventConsequences
  ) {
    // nothing to do.
  }
  public async consequenceForEvent(
    roomID: StringRoomID,
    eventID: StringEventID,
    reason: string
  ): Promise<ActionResult<void>> {
    const capabilityResult = await this.capability.consequenceForEvent(
      roomID,
      eventID,
      reason
    );
    const title = (
      <fragment>Redacting {Permalinks.forEvent(roomID, eventID)}.</fragment>
    );
    if (isError(capabilityResult)) {
      this.messageCollector.addOneliner(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          title,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    this.messageCollector.addOneliner(this.description, this.capability, title);
    return capabilityResult;
  }

  public get requiredEventPermissions() {
    return this.capability.requiredEventPermissions;
  }

  public get requiredPermissions() {
    return this.capability.requiredPermissions;
  }

  public get requiredStatePermissions() {
    return this.capability.requiredStatePermissions;
  }
}

describeCapabilityRenderer<EventConsequences, Draupnir>({
  name: "StandardEventConsequences",
  description: "Renders the standard event consequences capability",
  interface: "EventConsequences",
  factory(description, draupnir, capability) {
    return new StandardEventConsequencesRenderer(
      description,
      draupnir.capabilityMessageRenderer,
      capability
    );
  },
  isDefaultForInterface: true,
});

describeCapabilityContextGlue<Draupnir, { eventRedacter: RoomEventRedacter }>({
  name: "StandardEventConsequences",
  glueMethod: function (
    protectionDescription,
    draupnir,
    capabilityProvider
  ): Capability {
    return capabilityProvider.factory(protectionDescription, {
      eventRedacter: draupnir.clientPlatform.toRoomEventRedacter(),
    });
  },
});
