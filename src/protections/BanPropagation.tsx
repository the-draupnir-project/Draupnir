/**
 * Copyright (C) 2022-2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 *
 * In addition to the above, I want to add that this protection was inspired by
 * a Mjolnir PR that was originally created by Gergő Fándly https://github.com/matrix-org/mjolnir/pull/223
 */

import { JSXFactory } from "../commands/interface-manager/JSXFactory";
import { renderMatrixAndSend } from "../commands/interface-manager/DeadDocumentMatrix";
import { renderMentionPill } from "../commands/interface-manager/MatrixHelpRenderer";
import { UserID } from "matrix-bot-sdk";
import { renderListRules } from "../commands/Rules";
import { printActionResult } from "../models/RoomUpdateError";
import { AbstractProtection, ActionResult, ConsequenceProvider, Logger, MatrixRoomID, MatrixRoomReference, MembershipChange, MembershipChangeType, Ok, PermissionError, PolicyRule, PolicyRuleType, ProtectedRoomsSet, Protection, ProtectionDescription, Recommendation, RoomActionError, RoomMembershipRevision, RoomUpdateError, StringRoomID, StringUserID, Task, describeProtection, isError, serverName } from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";

const log = new Logger('BanPropagationProtection');

const BAN_PROPAGATION_PROMPT_LISTENER = 'ge.applied-langua.ge.draupnir.ban_propagation';
const UNBAN_PROPAGATION_PROMPT_LISTENER = 'ge.applied-langua.ge.draupnir.unban_propagation';

// FIXME: https://github.com/the-draupnir-project/Draupnir/issues/160
function makePolicyRoomReactionReferenceMap(rooms: MatrixRoomID[]): Map<string, string> {
    return rooms.reduce((map, room, index) => (map.set(`${index + 1}.`, room.toPermalink()), map), new Map())
}

// would be nice to be able to use presentation types here idk.
interface BanPropagationMessageContext {
    target: string,
    reason?: string,
}

/**
 * Prompt the management room to propagate a user ban to a policy list of their choice.
 * @param mjolnir Mjolnir.
 * @param event The ban event.
 * @param roomId The room that the ban happened in.
 * @returns An event id which can be used by the `PromptResponseListener`.
 */
async function promptBanPropagation(
    draupnir: Draupnir,
    change: MembershipChange,
): Promise<void> {
    const editablePolicyRoomIDs = draupnir.managerManager.policyRoomManager.getEditablePolicyRoomIDs(
        draupnir.clientUserID,
        PolicyRuleType.User
    );
    const reactionMap = makePolicyRoomReactionReferenceMap(editablePolicyRoomIDs);
    const promptEventId = (await renderMatrixAndSend(
        <root>The user {renderMentionPill(change.userID, change.content.displayname ?? change.userID)} was banned
                in <a href={`https://matrix.to/#/${change.roomID}`}>{change.roomID}</a> by {new UserID(change.sender)} for <code>{change.content.reason ?? '<no reason supplied>'}</code>.<br/>
                Would you like to add the ban to a policy list?
            <ol>
                {editablePolicyRoomIDs}
            </ol>
        </root>,
        draupnir.managementRoomID,
        undefined,
        draupnir.client,
        draupnir.reactionHandler.createAnnotation(
            BAN_PROPAGATION_PROMPT_LISTENER,
            reactionMap,
            {
                target: change.userID,
                reason: change.content.reason,
            }
        )
    )).at(0) as string;
    await draupnir.reactionHandler.addReactionsToEvent(draupnir.client, draupnir.managementRoomID, promptEventId, reactionMap);
}

async function promptUnbanPropagation(
    draupnir: Draupnir,
    event: any,
    roomId: string,
    rulesMatchingUser: Map<StringRoomID, PolicyRule[]>
): Promise<void> {
    const reactionMap = new Map<string, string>(Object.entries({ 'unban from all': 'unban from all'}));
    // shouldn't we warn them that the unban will be futile?
    const promptEventId = (await renderMatrixAndSend(
        <root>
            The user {renderMentionPill(event["state_key"], event["content"]?.["displayname"] ?? event["state_key"])} was unbanned
            from the room <a href={`https://matrix.to/#/${roomId}`}>{roomId}</a> by {new UserID(event["sender"])} for <code>{event["content"]?.["reason"] ?? '<no reason supplied>'}</code>.<br/>
            However there are rules in Draupnir's watched lists matching this user:
            <ul>
            {
            [...rulesMatchingUser.entries()]
                .map(([list, rules]) => <li>{renderListRules({
                    roomRef: draupnir.createRoomReference(list).toPermalink(),
                    roomId: list,
                    matches: rules
                })}</li>)
            }
            </ul>
            Would you like to remove these rules and unban the user from all protected rooms?
        </root>,
        draupnir.managementRoomID,
        undefined,
        draupnir.client,
        draupnir.reactionHandler.createAnnotation(
            UNBAN_PROPAGATION_PROMPT_LISTENER,
            reactionMap,
            {
                target: event["state_key"],
                reason: event["content"]?.["reason"],
            }
        )
    )).at(0) as string;
    await draupnir.reactionHandler.addReactionsToEvent(draupnir.client, draupnir.managementRoomID, promptEventId, reactionMap);
}

export class BanPropagationProtection extends AbstractProtection implements Protection {

    constructor(
        description: ProtectionDescription,
        consequenceProvider: ConsequenceProvider,
        protectedRoomsSet: ProtectedRoomsSet,
        private readonly draupnir: Draupnir,
      ) {
        super(description, consequenceProvider, protectedRoomsSet, [], []);
        // FIXME: These listeners are gonna leak all over if we don't have a
        // hook for stopping protections.
        this.draupnir.reactionHandler.on(BAN_PROPAGATION_PROMPT_LISTENER, this.banReactionListener.bind(this));
        this.draupnir.reactionHandler.on(UNBAN_PROPAGATION_PROMPT_LISTENER, this.unbanUserReactionListener.bind(this));
    }

    public async handleMembershipChange(revision: RoomMembershipRevision, changes: MembershipChange[]): Promise<ActionResult<void>> {
        const bans = changes.filter(change => change.membershipChangeType === MembershipChangeType.Banned && change.sender !== this.protectedRoomsSet.userID);
        const unbans = changes.filter(change => change.membershipChangeType === MembershipChangeType.Unbanned && change.sender !== this.protectedRoomsSet.userID);
        for (const ban of bans) {
            this.handleBan(ban);
        }
        for (const unban of unbans) {
            this.handleUnban(unban);
        }
        return Ok(undefined);
    }

    private handleBan(change: MembershipChange): void {
        const policyRevision = this.protectedRoomsSet.issuerManager.policyListRevisionIssuer.currentRevision;
        const rulesMatchingUser = policyRevision.allRulesMatchingEntity(change.userID, PolicyRuleType.User, Recommendation.Ban);
        if (rulesMatchingUser.length > 0) {
            return; // user is already banned.
        }
        Task(promptBanPropagation(this.draupnir, change));
    }

    private handleUnban(change: MembershipChange): void {
        const policyRevision = this.protectedRoomsSet.issuerManager.policyListRevisionIssuer.currentRevision;
        const rulesMatchingUser = policyRevision.allRulesMatchingEntity(change.userID, PolicyRuleType.User, Recommendation.Ban);
        if (rulesMatchingUser.length === 0) {
            return; // user is already unbanned.
        }
        const addRule = (map: Map<StringRoomID, PolicyRule[]>, rule: PolicyRule) => {
            const listRoomID = rule.sourceEvent.room_id;
            const entry = map.get(listRoomID) ?? ((newEntry) => (map.set(listRoomID, newEntry), newEntry))([]);
            entry.push(rule);
            return map;
        }
        Task(promptUnbanPropagation(
            this.draupnir,
            change,
            change.roomID,
            rulesMatchingUser.reduce((map, rule) => addRule(map, rule), new Map<StringRoomID, PolicyRule[]>())
        ));
    }

    private async banReactionListener(key: string, item: unknown, context: BanPropagationMessageContext) {
        if (typeof item === 'string') {
            const policyRoomRef = MatrixRoomReference.fromPermalink(item);
            if (isError(policyRoomRef)) {
                log.error(`Could not parse the room reference for the policy list to ban a user within ${item}`, policyRoomRef.error, context);
                return;
            }
            const roomID = await resolveRoomReferenceSafe(this.draupnir.client, policyRoomRef.ok);
            if (isError(roomID)) {
                log.error(`Could not resolve the room reference for the policy list to ban a user within ${policyRoomRef.ok.toPermalink()}`, roomID.error);
                return;
            }
            const listResult = await this.draupnir.managerManager.policyRoomManager.getPolicyRoomEditor(roomID.ok)
            if (isError(listResult)) {
                log.error(`Could not find a policy list for the policy room ${policyRoomRef.ok.toPermalink()}`, listResult.error);
                return;
            }
            const banResult = await listResult.ok.banEntity(PolicyRuleType.User, context.target, context.reason);
            if (isError(banResult)) {
                log.error(`Could not ban a user ${context.target} from the list ${policyRoomRef.ok.toPermalink()}`, banResult.error);
            }
        } else {
            log.error(`The Ban Result map has been malformed somehow item:`, item);
        }
    }

    private async unbanUserReactionListener(key: string, item: unknown, context: BanPropagationMessageContext): Promise<void> {
        if (item === 'unban from all') {
            // FIXME:
            // the unban from lists code should be moved to a standard consequence.
            const errors: RoomUpdateError[] = [];
            const policyRevision = this.protectedRoomsSet.issuerManager.policyListRevisionIssuer.currentRevision;
            const rulesMatchingUser = policyRevision.allRulesMatchingEntity(context.target, PolicyRuleType.User, Recommendation.Ban);
            const listsWithRules = new Set<StringRoomID>(rulesMatchingUser.map((rule) => rule.sourceEvent.room_id));
            const editablePolicyRooms = this.draupnir.managerManager.policyRoomManager.getEditablePolicyRoomIDs(this.draupnir.clientUserID, PolicyRuleType.User);
            for (const roomIDWithPolicy of listsWithRules) {
                const editablePolicyRoom = editablePolicyRooms.find((room) => room.toRoomIDOrAlias() === roomIDWithPolicy);
                if (editablePolicyRoom === undefined) {
                    const roomID = MatrixRoomReference.fromRoomID(roomIDWithPolicy, [serverName(this.draupnir.clientUserID)]);
                    errors.push(new PermissionError(roomID, `${this.draupnir.clientUserID} doesn't have the power level to remove the policy banning ${context.target} within ${roomID.toPermalink()}`));
                    continue;
                }
                const editorResult = await this.draupnir.managerManager.policyRoomManager.getPolicyRoomEditor(editablePolicyRoom);
                if (isError(editorResult)) {
                    errors.push(RoomActionError.fromActionError(editablePolicyRoom, editorResult.error));
                    continue;
                }
                const editor = editorResult.ok;
                const unbanResult = await editor.unbanEntity(PolicyRuleType.User, context.target);
                if (isError(unbanResult)) {
                    errors.push(RoomActionError.fromActionError(editablePolicyRoom, unbanResult.error));
                    continue;
                }
            }
            if (errors.length > 0) {
                Task(printActionResult(
                    this.draupnir.client,
                    this.draupnir.managementRoomID,
                    errors,
                    { title: `There were errors unbanning ${context.target} from all lists.`}
                ));
            } else {
                this.consequenceProvider.unbanUserFromRoomsInSet(
                    this.description,
                    context.target as StringUserID,
                    this.protectedRoomsSet
                )
            }
        } else {
            log.error(`unban reaction map is malformed got item ${item} for key ${key}`);
        }
    }
}

describeProtection<Draupnir>({
    name: 'BanPropagationProtection',
    description:
    "When you ban a user in any protected room with a client, this protection\
    will turn the room level ban into a policy for a policy list of your choice.\
    This will then allow the bot to ban the user from all of your rooms.",
    factory: (decription, consequenceProvider, protectedRoomsSet, draupnir, _settings) =>
      Ok(
        new BanPropagationProtection(
          decription,
          consequenceProvider,
          protectedRoomsSet,
          draupnir
        )
      ),
  });
