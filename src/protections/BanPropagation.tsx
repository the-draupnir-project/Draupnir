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

import { Protection } from "./Protection";
import { Mjolnir } from "../Mjolnir";
import { LogService } from "matrix-bot-sdk";
import { JSXFactory } from "../commands/interface-manager/JSXFactory";
import { renderMatrixAndSend } from "../commands/interface-manager/DeadDocumentMatrix";
import { renderMentionPill } from "../commands/interface-manager/MatrixHelpRenderer";
import { RULE_USER, ListRule } from "../models/ListRule";
import { UserID } from "matrix-bot-sdk";
import { MatrixRoomReference } from "../commands/interface-manager/MatrixRoomReference";
import { findPolicyListFromRoomReference } from "../commands/Ban";
import { trace } from '../utils';
import PolicyList from "../models/PolicyList";
import { renderListRules } from "../commands/Rules";
import { printActionResult, IRoomUpdateError, RoomUpdateException } from "../models/RoomUpdateError";
import { CommandExceptionKind } from "../commands/interface-manager/CommandException";

const BAN_PROPAGATION_PROMPT_LISTENER = 'ge.applied-langua.ge.draupnir.ban_propagation';
const UNBAN_PROPAGATION_PROMPT_LISTENER = 'ge.applied-langua.ge.draupnir.unban_propagation';

function makePolicyListShortcodeReferenceMap(lists: PolicyList[]): Map<string, string> {
    return lists.reduce((map, list, index) => (map.set(`${index + 1}.`, list.roomRef), map), new Map())
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
    mjolnir: Mjolnir,
    event: any,
    roomId: string
): Promise</*event id*/string> {
    const reactionMap = makePolicyListShortcodeReferenceMap(mjolnir.policyListManager.lists);
    const promptEventId = (await renderMatrixAndSend(
        <root>The user {renderMentionPill(event["state_key"], event["content"]?.["displayname"] ?? event["state_key"])} was banned
            in <a href={`https://matrix.to/#/${roomId}`}>{roomId}</a> by {new UserID(event["sender"])} for <code>{event["content"]?.["reason"] ?? '<no reason supplied>'}</code>.<br />
            Would you like to add the ban to a policy list?
            <ol>
                {mjolnir.policyListManager.lists.map(list => <li>{list}</li>)}
            </ol>
        </root>,
        mjolnir.managementRoomId,
        undefined,
        mjolnir.client,
        mjolnir.reactionHandler.createAnnotation(
            BAN_PROPAGATION_PROMPT_LISTENER,
            reactionMap,
            {
                target: event["state_key"],
                reason: event["content"]?.["reason"],
            }
        )
    )).at(0) as string;
    await mjolnir.reactionHandler.addReactionsToEvent(mjolnir.client, mjolnir.managementRoomId, promptEventId, reactionMap);
    return promptEventId;
}

async function promptUnbanPropagation(
    mjolnir: Mjolnir,
    event: any,
    roomId: string,
    rulesMatchingUser: Map<PolicyList, ListRule[]>
): Promise</*event id*/string> {
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
                    shortcode: list.listShortcode,
                    roomRef: list.roomRef,
                    roomId: list.roomId,
                    matches: rules
                })}</li>)
            }
            </ul>
            Would you like to remove these rules and unban the user from all protected rooms?
        </root>,
        mjolnir.managementRoomId,
        undefined,
        mjolnir.client,
        mjolnir.reactionHandler.createAnnotation(
            UNBAN_PROPAGATION_PROMPT_LISTENER,
            reactionMap,
            {
                target: event["state_key"],
                reason: event["content"]?.["reason"],
            }
        )
    )).at(0) as string;
    await mjolnir.reactionHandler.addReactionsToEvent(mjolnir.client, mjolnir.managementRoomId, promptEventId, reactionMap);
    return promptEventId;
}

interface ListenerContext {
    mjolnir: Mjolnir,
}

async function banReactionListener(this: ListenerContext, key: string, item: unknown, context: BanPropagationMessageContext) {
    try {
        if (typeof item === 'string') {
            const listRef = MatrixRoomReference.fromPermalink(item);
            const listResult = await findPolicyListFromRoomReference(this.mjolnir, listRef);
            if (listResult.isOk()) {
                return await listResult.ok.banEntity(RULE_USER, context.target, context.reason);
            } else {
                LogService.warn("BanPropagation", "Timed out waiting for a response to a room level ban", listResult.err);
                return;
            }
        } else {
            throw new TypeError("The ban prompt event's reaction map is malformed.")
        }
    } catch (e) {
        LogService.error('BanPropagation', "Encountered an error while prompting the user for instructions to propagate a room level ban", e);
    }
}

async function unbanFromAllLists(mjolnir: Mjolnir, user: string): Promise<IRoomUpdateError[]> {
    const errors: IRoomUpdateError[] = [];
    for (const list of mjolnir.policyListManager.lists) {
        try {
            await list.unbanEntity(RULE_USER, user);
        } catch (e) {
            LogService.info('BanPropagation', `Could not unban ${user} from ${list.roomRef}`, e);
            const message = e.message || (e.body ? e.body.error : '<no message>');
            errors.push(new RoomUpdateException(
                list.roomId,
                message.includes("You don't have permission") ? CommandExceptionKind.Known : CommandExceptionKind.Unknown,
                e,
                message
            ));
        }
    }
    return errors;
}

async function unbanUserReactionListener(this: ListenerContext, _key: string, item: unknown, context: BanPropagationMessageContext): Promise<void> {
    try {
        if (item === 'unban from all') {
            const listErrors = await unbanFromAllLists(this.mjolnir, context.target);
            if (listErrors.length > 0) {
                await printActionResult(
                    this.mjolnir.client,
                    this.mjolnir.managementRoomId,
                    listErrors,
                    { title: `There were errors unbanning ${context.target} from all lists.`}
                );
            } else {
                const unbanErrors = await this.mjolnir.protectedRoomsTracker.unbanUser(context.target);
                await printActionResult(
                    this.mjolnir.client,
                    this.mjolnir.managementRoomId,
                    unbanErrors,
                    {
                        title: `There were errors unbanning ${context.target} from protected rooms.`,
                        noErrorsText: `Done unbanning ${context.target} from protected rooms - no errors.`
                    }
                );
            }
        }
    } catch (e) {
        LogService.error(`BanPropagationProtection`, "Unexpected error unbanning a user", e);
    }
}

export class BanPropagation extends Protection {

    settings = {};

    public get name(): string {
        return 'BanPropagationProtection';
    }
    public get description(): string {
        return "When you ban a user in any protected room with a client, this protection\
        will turn the room level ban into a policy for a policy list of your choice.\
        This will then allow the bot to ban the user from all of your rooms.";
    }

    @trace
    public async registerProtection(mjolnir: Mjolnir): Promise<void> {
        mjolnir.reactionHandler.on(BAN_PROPAGATION_PROMPT_LISTENER, banReactionListener.bind({ mjolnir }));
        mjolnir.reactionHandler.on(UNBAN_PROPAGATION_PROMPT_LISTENER, unbanUserReactionListener.bind({ mjolnir }));
    }

    @trace
    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {
        if (event['type'] !== 'm.room.member'
            || !(event['content']?.['membership'] === 'ban' || event['content']?.['membership'] === 'leave')) {
            return;
        }
        const rulesMatchingUser = mjolnir.policyListManager.lists.reduce(
            (listMap, list) => {
                const rules = list.rulesMatchingEntity(event['state_key'], RULE_USER);
                if (rules.length > 0) {
                    listMap.set(list, rules)
                };
                return listMap
            }, new Map<PolicyList, ListRule[]>()
        );
        const userMembership = event['content']?.['membership'];
        if (userMembership === 'ban') {
            if (rulesMatchingUser.size > 0) {
                return; // The user is already banned.
            }
            // do not await, we don't want to block the protection manager
            promptBanPropagation(mjolnir, event, roomId)
        } else if (userMembership === 'leave' && rulesMatchingUser.size > 0) {
            // Then this is a banned user being unbanned.
            // do not await, we don't want to block the protection manager
            promptUnbanPropagation(mjolnir, event, roomId, rulesMatchingUser);
        }
    }
}
