// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionResult, Capability, DescriptionMeta, EventConsequences, Permalinks, RoomEventRedacter, StringEventID, StringRoomID, describeCapabilityContextGlue, describeCapabilityRenderer, isError } from "matrix-protection-suite";
import { RendererMessageCollector } from "./RendererMessageCollector";
import { renderFailedSingularConsequence } from "./CommonRenderers";
import { JSXFactory } from "../commands/interface-manager/JSXFactory";
import { Draupnir } from "../Draupnir";

class StandardEventConsequencesRenderer implements EventConsequences {
    constructor(
        private readonly description: DescriptionMeta,
        private readonly messageCollector: RendererMessageCollector,
        private readonly capability: EventConsequences
    ) {
        // nothing to do.
    }
    public readonly requiredEventPermissions = this.capability.requiredEventPermissions;
    public readonly requiredPermissions = this.capability.requiredPermissions;
    public async consequenceForEvent(roomID: StringRoomID, eventID: StringEventID, reason: string): Promise<ActionResult<void>> {
        const capabilityResult = await this.capability.consequenceForEvent(roomID, eventID, reason);
        const title = <fragment>Redacting {Permalinks.forEvent(roomID, eventID)}.</fragment>;
        if (isError(capabilityResult)) {
            this.messageCollector.addOneliner(this.description, renderFailedSingularConsequence(this.description, title, capabilityResult.error))
            return capabilityResult;
        }
        this.messageCollector.addOneliner(this.description, title)
        return capabilityResult;
    }
}

describeCapabilityRenderer<EventConsequences, Draupnir>({
    name: 'StandardEventConsequencesRenderer',
    description: 'Renders the standard event consequences capability',
    interface: 'EventConsequences',
    factory(description, draupnir, capability) {
        return new StandardEventConsequencesRenderer(
            description,
            draupnir.capabilityMessageRenderer,
            capability
        );
    }
})

describeCapabilityContextGlue<Draupnir, { eventRedacter: RoomEventRedacter }>({
    name: "StandardEventConsequencesRenderer",
    glueMethod: function (protectionDescription, draupnir, capabilityProvider): Capability {
        return capabilityProvider.factory(protectionDescription, { eventRedacter: draupnir.clientPlatform.toRoomEventRedacter() })
    }
})
