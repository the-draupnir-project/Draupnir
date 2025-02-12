// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionResult,
  Capability,
  DescriptionMeta,
  PolicyListRevision,
  RoomSetResult,
  ServerACLConsequencesContext,
  ServerConsequences,
  describeCapabilityContextGlue,
  describeCapabilityRenderer,
  isError,
} from "matrix-protection-suite";
import { RendererMessageCollector } from "./RendererMessageCollector";
import {
  renderFailedSingularConsequence,
  renderRoomSetResult,
} from "./CommonRenderers";
import { Draupnir } from "../Draupnir";
import {
  StringRoomID,
  Permalinks,
} from "@the-draupnir-project/matrix-basic-types";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";

class StandardServerConsequencesRenderer implements ServerConsequences {
  constructor(
    private readonly description: DescriptionMeta,
    private readonly messageCollector: RendererMessageCollector,
    private readonly capability: ServerConsequences
  ) {
    // nothing to do.
  }
  public readonly requiredEventPermissions =
    this.capability.requiredEventPermissions;
  public readonly requiredPermissions = this.capability.requiredPermissions;
  public readonly requiredStatePermissions =
    this.capability.requiredStatePermissions;
  public async consequenceForServersInRoom(
    roomID: StringRoomID,
    revision: PolicyListRevision
  ): Promise<ActionResult<boolean>> {
    const capabilityResult = await this.capability.consequenceForServersInRoom(
      roomID,
      revision
    );
    const title = (
      <fragment>
        Setting server ACL in {Permalinks.forRoom(roomID)} as it is out of sync
        with watched policies.
      </fragment>
    );
    if (isError(capabilityResult)) {
      this.messageCollector.addMessage(
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
    // only add the message if we changed anything in the room.
    if (capabilityResult.ok) {
      this.messageCollector.addOneliner(
        this.description,
        this.capability,
        title
      );
    }
    return capabilityResult;
  }
  public async consequenceForServersInRoomSet(
    revision: PolicyListRevision
  ): Promise<ActionResult<RoomSetResult>> {
    const capabilityResult =
      await this.capability.consequenceForServersInRoomSet(revision);
    const title = <fragment>Updating server ACL in protected rooms.</fragment>;
    if (isError(capabilityResult)) {
      this.messageCollector.addMessage(
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
    this.messageCollector.addMessage(
      this.description,
      this.capability,
      renderRoomSetResult(capabilityResult.ok, {
        summary: (
          <fragment>
            <code>{this.description.name}</code>: {title}
          </fragment>
        ),
      })
    );
    return capabilityResult;
  }
  public async unbanServerFromRoomSet(
    serverName: string,
    reason: string
  ): Promise<ActionResult<RoomSetResult>> {
    const capabilityResult = await this.capability.unbanServerFromRoomSet(
      serverName,
      reason
    );
    const title = (
      <fragment>
        Removing {serverName} from denied servers in protected rooms.
      </fragment>
    );
    if (isError(capabilityResult)) {
      this.messageCollector.addMessage(
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
    this.messageCollector.addMessage(
      this.description,
      this.capability,
      renderRoomSetResult(capabilityResult.ok, {
        summary: (
          <fragment>
            <code>{this.description.name}</code>: {title}
          </fragment>
        ),
      })
    );
    return capabilityResult;
  }
}

describeCapabilityRenderer<ServerConsequences, Draupnir>({
  name: "ServerACLConsequences",
  description: "Render server consequences.",
  interface: "ServerConsequences",
  factory(description, draupnir, capability) {
    return new StandardServerConsequencesRenderer(
      description,
      draupnir.capabilityMessageRenderer,
      capability
    );
  },
  isDefaultForInterface: true,
});

describeCapabilityContextGlue<Draupnir, ServerACLConsequencesContext>({
  name: "ServerACLConsequences",
  glueMethod: function (
    protectionDescription,
    draupnir,
    capabilityProvider
  ): Capability {
    return capabilityProvider.factory(protectionDescription, {
      stateEventSender: draupnir.clientPlatform.toRoomStateEventSender(),
      protectedRoomsSet: draupnir.protectedRoomsSet,
    });
  },
});

describeCapabilityContextGlue<Draupnir, ServerACLConsequencesContext>({
  name: "SimulatedServerConsequences",
  glueMethod: function (
    protectionDescription,
    draupnir,
    capabilityProvider
  ): Capability {
    return capabilityProvider.factory(protectionDescription, {
      protectedRoomsSet: draupnir.protectedRoomsSet,
    } as ServerACLConsequencesContext);
  },
});
