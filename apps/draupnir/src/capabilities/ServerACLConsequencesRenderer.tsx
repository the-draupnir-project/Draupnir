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
  RoomSetResult,
  ServerACLSynchronisationCapabilityContext,
  ServerBanIntentProjection,
  ServerBanSynchronisationCapability,
  describeCapabilityContextGlue,
  describeCapabilityRenderer,
  isError,
} from "matrix-protection-suite";
import { RendererMessageCollector } from "./RendererMessageCollector";
import { Draupnir } from "../Draupnir";
import {
  StringRoomID,
  Permalinks,
} from "@the-draupnir-project/matrix-basic-types";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import {
  renderFailedSingularConsequence,
  renderRoomSetResult,
} from "@the-draupnir-project/mps-interface-adaptor";

class StandardServerBanSynchronisationCapabilityRenderer
  implements ServerBanSynchronisationCapability
{
  constructor(
    private readonly description: DescriptionMeta,
    private readonly messageCollector: RendererMessageCollector,
    private readonly capability: ServerBanSynchronisationCapability
  ) {
    // nothing to do.
  }
  public readonly requiredEventPermissions =
    this.capability.requiredEventPermissions;
  public readonly requiredPermissions = this.capability.requiredPermissions;
  public readonly requiredStatePermissions =
    this.capability.requiredStatePermissions;
  public async outcomeFromIntentInRoom(
    roomID: StringRoomID,
    projection: ServerBanIntentProjection
  ): Promise<ActionResult<boolean>> {
    const capabilityResult = await this.capability.outcomeFromIntentInRoom(
      roomID,
      projection
    );
    const title = (
      <fragment>
        Setting server ACL in {Permalinks.forRoom(roomID)} as it is out of sync
        with watched policies.
      </fragment>
    );
    // only add the message if we failed, otherwise it's too spammy.
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
    return capabilityResult;
  }
  public async outcomeFromIntentInRoomSet(
    projection: ServerBanIntentProjection
  ): Promise<ActionResult<RoomSetResult>> {
    const capabilityResult =
      await this.capability.outcomeFromIntentInRoomSet(projection);
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
    // Only show this when results are failing.
    if (!capabilityResult.ok.isEveryResultOk) {
      this.messageCollector.addMessage(
        this.description,
        this.capability,
        renderRoomSetResult(capabilityResult.ok, {
          summary: (
            <fragment>
              <code>{this.description.name}</code>: {title}
            </fragment>
          ),
          showOnlyFailed: true,
        })
      );
    }
    return capabilityResult;
  }
}

describeCapabilityRenderer<ServerBanSynchronisationCapability, Draupnir>({
  name: "ServerACLSynchronisationCapability",
  description: "Render the server ban capability.",
  interface: "ServerBanSynchronisationCapability",
  factory(description, draupnir, capability) {
    return new StandardServerBanSynchronisationCapabilityRenderer(
      description,
      draupnir.capabilityMessageRenderer,
      capability
    );
  },
  isDefaultForInterface: true,
});

describeCapabilityContextGlue<
  Draupnir,
  ServerACLSynchronisationCapabilityContext
>({
  name: "ServerACLSynchronisationCapability",
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

describeCapabilityContextGlue<
  Draupnir,
  ServerACLSynchronisationCapabilityContext
>({
  name: "SimulatedServerBanSynchronisationCapability",
  glueMethod: function (
    protectionDescription,
    draupnir,
    capabilityProvider
  ): Capability {
    return capabilityProvider.factory(protectionDescription, {
      protectedRoomsSet: draupnir.protectedRoomsSet,
    } as ServerACLSynchronisationCapabilityContext);
  },
});
