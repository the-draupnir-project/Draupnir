// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { JSXFactory } from "../commands/interface-manager/JSXFactory";
import { ActionResult, Capability, DescriptionMeta, Ok, Permalinks, PolicyListRevision, ResultForUserInSetMap, StandardUserConsequencesContext, StringRoomID, StringUserID, UserConsequences, describeCapabilityContextGlue, describeCapabilityRenderer, isError } from "matrix-protection-suite";
import { RendererMessageCollector } from "./RendererMessageCollector";
import { renderFailedSingularConsequence, renderRoomSetResult } from "./CommonRenderers";
import { DocumentNode } from "../commands/interface-manager/DeadDocument";
import { Draupnir } from "../Draupnir";

// yeah i know this is a bit insane but whatever, it can be our secret.
function renderResultForUserInSetMap(usersInSetMap: ResultForUserInSetMap, {
    ingword,
    nnedword,
    description
}: {
    ingword: string,
    nnedword: string,
    description: DescriptionMeta,
}): DocumentNode {
    return <details>
    <summary><code>{description.name}</code>: {ingword} {usersInSetMap.size} {usersInSetMap.size === 1 ? 'user' : 'users'} from protected rooms.</summary>
    {[...usersInSetMap.entries()].map(([userID, roomResults]) => {
        return renderRoomSetResult(roomResults, { summary: <fragment>{userID} will be {nnedword} from {roomResults.map.size} rooms.</fragment> })
    })}
</details>
}


class StandardUserConsequencesRenderer implements UserConsequences {
    constructor(
        private readonly description: DescriptionMeta,
        private readonly messageCollector: RendererMessageCollector,
        private readonly capability: UserConsequences
    ) {
        // nothing to do.
    }
    public readonly requiredEventPermissions = this.capability.requiredEventPermissions;
    public readonly requiredPermissions = this.capability.requiredPermissions;

    public async consequenceForUserInRoom(roomID: StringRoomID, userID: StringUserID, reason: string): Promise<ActionResult<void>> {
        const capabilityResult = await this.capability.consequenceForUserInRoom(roomID, userID, reason);
        if (isError(capabilityResult)) {
            this.messageCollector.addMessage(this.description, renderFailedSingularConsequence(this.description, capabilityResult.error))
            return capabilityResult;
        }
        this.messageCollector.addOneliner(this.description, <fragment>
            Banning user {userID} in {Permalinks.forRoom(roomID)} for {reason}.
        </fragment>)
        return Ok(undefined);

    }
    public async consequenceForUserInRoomSet(revision: PolicyListRevision): Promise<ActionResult<ResultForUserInSetMap>> {
        const capabilityResult = await this.capability.consequenceForUserInRoomSet(revision);
        if (isError(capabilityResult)) {
            this.messageCollector.addMessage(this.description, renderFailedSingularConsequence(this.description, capabilityResult.error))
            return capabilityResult;
        }
        const usersInSetMap = capabilityResult.ok;
        if (usersInSetMap.size === 0) {
            return capabilityResult;
        }
        this.messageCollector.addMessage(this.description, renderResultForUserInSetMap(usersInSetMap, {
            ingword: 'Banning',
            nnedword: 'banned',
            description: this.description,
        }));
        return capabilityResult;

    }
    public async unbanUserFromRoomSet(userID: StringUserID, reason: string): Promise<ActionResult<ResultForUserInSetMap>> {
        const capabilityResult = await this.capability.unbanUserFromRoomSet(userID, reason);
        if (isError(capabilityResult)) {
            this.messageCollector.addMessage(this.description, renderFailedSingularConsequence(this.description, capabilityResult.error))
            return capabilityResult;
        }
        const usersInSetMap = capabilityResult.ok;
        if (usersInSetMap.size === 0) {
            return capabilityResult;
        }
        this.messageCollector.addMessage(this.description, renderResultForUserInSetMap(usersInSetMap, {
            ingword: 'Unbanning',
            nnedword: 'unbanned',
            description: this.description,
        }));
        return capabilityResult;
    }

}

describeCapabilityRenderer<UserConsequences, Draupnir>({
    name: 'StandardUserConsequences',
    description: 'Renders your mum uselesss',
    interface: 'UserConsequences',
    factory(description, draupnir, capability) {
        return new StandardUserConsequencesRenderer(description, draupnir.capabilityMessageRenderer, capability)
    }
})

describeCapabilityContextGlue<Draupnir, StandardUserConsequencesContext>({
    name: "StandardUserConsequences",
    glueMethod: function (protectionDescription, draupnir, capabilityProvider): Capability {
        return capabilityProvider.factory(protectionDescription, {
            roomBanner: draupnir.clientPlatform.toRoomBanner(),
            roomUnbanner: draupnir.clientPlatform.toRoomUnbanner(),
            setMembership: draupnir.protectedRoomsSet.setMembership
        })
    }
})
