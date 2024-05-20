// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { AbstractProtection, ActionError, ActionResult, Logger, MatrixRoomReference, MembershipEvent, Ok, Permalink, ProtectedRoomsSet, ProtectionDescription, RoomEvent, StringRoomID, Task, Value, describeProtection, isError, serverName } from "matrix-protection-suite";
import { Draupnir } from "../../Draupnir";
import { DraupnirProtection } from "../Protection";
import { isInvitationForUser, isSenderJoinedInRevision } from "./inviteCore";
import { renderMatrixAndSend } from "../../commands/interface-manager/DeadDocumentMatrix";
import { DocumentNode } from "../../commands/interface-manager/DeadDocument";
import { JSXFactory } from "../../commands/interface-manager/JSXFactory";
import { renderActionResultToEvent, renderMentionPill, renderRoomPill } from "../../commands/interface-manager/MatrixHelpRenderer";
import { renderFailedSingularConsequence } from "../../capabilities/CommonRenderers";
import { StaticDecode, Type } from "@sinclair/typebox";

const log = new Logger('ProtectRoomsOnInviteProtection');

export type ProtectRoomsOnInviteProtectionCapabilities = {};

export type ProtectRoomsOnInviteProtectionDescription = ProtectionDescription<Draupnir, {}, ProtectRoomsOnInviteProtectionCapabilities>;

const PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER = 'me.marewolf.draupnir.protect_rooms_on_invite';

// would be nice to be able to use presentation types here idk.
const ProtectRoomsOnInvitePromptContext = Type.Object({
    invited_room: Permalink
});
// this rule is stupid.
// eslint-disable-next-line no-redeclare
type ProtectRoomsOnInvitePromptContext = StaticDecode<typeof ProtectRoomsOnInvitePromptContext>;

export class ProtectRoomsOnInviteProtection
    extends AbstractProtection<ProtectRoomsOnInviteProtectionDescription>
    implements DraupnirProtection<
    ProtectRoomsOnInviteProtectionDescription
> {
    private readonly protectPromptListener = this.protectListener.bind(this);
    public constructor(
        description: ProtectRoomsOnInviteProtectionDescription,
        capabilities: ProtectRoomsOnInviteProtectionCapabilities,
        protectedRoomsSet: ProtectedRoomsSet,
        private readonly draupnir: Draupnir,
    ) {
        super(
            description,
            capabilities,
            protectedRoomsSet,
            {}
        )
        this.draupnir.reactionHandler.on(PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER, this.protectPromptListener);
    }

    handleProtectionDisable(): void {
        this.draupnir.reactionHandler.off(PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER, this.protectPromptListener);
    }

    handleExternalInvite(roomID: StringRoomID, event: MembershipEvent): void {
        if (!isInvitationForUser(event, this.protectedRoomsSet.userID)) {
            return;
        }
        if (this.protectedRoomsSet.isProtectedRoom(roomID)) {
            return;
        }
        void Task(this.checkAgainstRequiredMembershipRoom(event));
    }

    private async checkAgainstRequiredMembershipRoom(event: MembershipEvent): Promise<ActionResult<void>> {
        const revision = this.draupnir.acceptInvitesFromRoomIssuer.currentRevision;
        if (isSenderJoinedInRevision(event.sender, revision)) {
            return await this.joinAndPromptProtect(event);
        } else {
            this.reportUnknownInvite(event, revision.room);
            return Ok(undefined);
        }
    }

    private reportUnknownInvite(event: MembershipEvent, requiredMembershipRoom: MatrixRoomReference): void {
        const renderUnknownInvite = (): DocumentNode => {
            return <root>
                {renderMentionPill(event.sender, event.sender)} has invited me to
                {renderRoomPill(MatrixRoomReference.fromRoomID(event.room_id))}
                but they are not joined to {renderRoomPill(requiredMembershipRoom)}, which prevents me from accepting their invitation.<br/>
                If you would like this room protected, use <code>!draupnir rooms add {event.room_id}</code>
            </root>
        }
        void Task((async () => {
            renderMatrixAndSend(
                renderUnknownInvite(),
                this.draupnir.managementRoomID,
                undefined,
                this.draupnir.client
            );
            return Ok(undefined)
        })());
    }

    private async joinInvitedRoom(event: MembershipEvent, room: MatrixRoomReference): Promise<ActionResult<MatrixRoomReference>> {
        const renderFailedTojoin = (error: ActionError) => {
            const title = <fragment>Unfortunatley I was unable to accept the invitation from {renderMentionPill(event.sender, event.sender)} to the room {renderRoomPill(room)}.</fragment>;
            return <root>
                {renderFailedSingularConsequence(this.description, title, error)}
            </root>
        };
        const joinResult = await this.draupnir.clientPlatform.toRoomJoiner().joinRoom(room);
        if (isError(joinResult)) {
            await renderMatrixAndSend(
                renderFailedTojoin(joinResult.error),
                this.draupnir.managementRoomID,
                undefined,
                this.draupnir.client
            )
        }
        return joinResult;
    }

    private async joinAndPromptProtect(event: MembershipEvent): Promise<ActionResult<void>> {
        const invitedRoomReference = MatrixRoomReference.fromRoomID(event.room_id, [serverName(event.sender), serverName(event.state_key)]);
        const joinResult = await this.joinInvitedRoom(event, invitedRoomReference);
        if (isError(joinResult)) {
            return joinResult;
        }
        const renderPromptProtect = (): DocumentNode =>
            <root>
                {renderMentionPill(event.sender, event.sender)} has invited me to
                {renderRoomPill(invitedRoomReference)},
                would you like to protect this room?
            </root>;
        const reactionMap = new Map<string, string>(Object.entries({ 'OK': 'OK', 'Cancel': 'Cancel' }));
        const promptEventID = (await renderMatrixAndSend(
            renderPromptProtect(),
            this.draupnir.managementRoomID,
            undefined,
            this.draupnir.client,
            this.draupnir.reactionHandler.createAnnotation(
                PROTECT_ROOMS_ON_INVITE_PROMPT_LISTENER,
                reactionMap,
                {
                    invited_room: invitedRoomReference.toPermalink(),
                }
            )
        ))[0];
        await this.draupnir.reactionHandler.addReactionsToEvent(this.draupnir.client, this.draupnir.managementRoomID, promptEventID, reactionMap);
        return Ok(undefined);
    }


    private protectListener(key: string, _item: unknown, rawContext: unknown, _reactionMap: Map<string, unknown>, promptEvent: RoomEvent): void {
        if (key === 'Cancel') {
            void Task(this.draupnir.reactionHandler.cancelPrompt(promptEvent));
            return;
        }
        if (key !== 'OK') {
            return;
        }
        const context = Value.Decode(ProtectRoomsOnInvitePromptContext, rawContext);
        if (isError(context)) {
            log.error(`Could not decode context from prompt event`, context.error);
            renderActionResultToEvent(this.draupnir.client, promptEvent, context);
            return;
        }
        void Task((async () => {
            const resolvedRoom = await this.draupnir.clientPlatform.toRoomResolver().resolveRoom(context.ok.invited_room);
            if (isError(resolvedRoom)) {
                resolvedRoom.elaborate(`Could not resolve the room to protect from the MatrixRoomReference: ${context.ok.invited_room.toPermalink()}.`);
                renderActionResultToEvent(this.draupnir.client, promptEvent, resolvedRoom);
                return;
            }
            const addResult = await this.protectedRoomsSet.protectedRoomsManager.addRoom(resolvedRoom.ok)
            if (isError(addResult)) {
                addResult.elaborate(`Could not protect the room: ${resolvedRoom.ok.toPermalink()}`);
                renderActionResultToEvent(this.draupnir.client, promptEvent, addResult);
                return;
            }
            renderActionResultToEvent(this.draupnir.client, promptEvent, addResult);
            void Task(this.draupnir.reactionHandler.completePrompt(promptEvent.room_id, promptEvent.event_id));
        })());
    }
}

describeProtection<{}, Draupnir>({
    name: ProtectRoomsOnInviteProtection.name,
    description: "Automatically joins rooms when invited by members of the management room and offers to protect them",
    capabilityInterfaces: {},
    defaultCapabilities: {},
    factory(description, protectedRoomsSet, draupnir, capabilities, _settings) {
        return Ok(
            new ProtectRoomsOnInviteProtection(
                description,
                capabilities,
                protectedRoomsSet,
                draupnir
            )
        )
    }
})
