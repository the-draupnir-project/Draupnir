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
 */

import { Protection } from "./Protection";
import { Mjolnir } from "../Mjolnir";
import { LogService } from "matrix-bot-sdk";
import { JSXFactory } from "../commands/interface-manager/JSXFactory";
import { renderMatrixAndSend } from "../commands/interface-manager/DeadDocumentMatrix";
import { renderMentionPill } from "../commands/interface-manager/MatrixHelpRenderer";
import { RULE_USER } from "../models/ListRule";
import { UserID } from "matrix-bot-sdk";
import { ReactionListener } from "../commands/interface-manager/MatrixReactionHandler";
import { PolicyListManager } from "../models/PolicyListManager";
import { MatrixRoomReference } from "../commands/interface-manager/MatrixRoomReference";
import { findPolicyListFromRoomReference } from "../commands/Ban";

const PROPAGATION_PROMPT_LISTENER = 'ge.applied-langua.ge.draupnir.ban_propagation';

function makePolicyListShortcodeReferenceMap(lists: PolicyListManager): Map<string, string> {
    return lists.lists.reduce((map, list, index) => (map.set(`${index + 1}.`, list.roomRef), map), new Map())
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
    const reactionMap = makePolicyListShortcodeReferenceMap(mjolnir.policyListManager);
    const promptEventId = (await renderMatrixAndSend(
        <root>The user {renderMentionPill(event["state_key"], event["content"]?.["displayname"] ?? event["state_key"])} was banned
                in <a href={`https://matrix.to/#/${roomId}`}>{roomId}</a> by {new UserID(event["sender"])} for <code>{event["content"]?.["reason"] ?? '<no reason supplied>'}</code>.<br/>
                Would you like to add the ban to a policy list?
            <ol>
                {mjolnir.policyListManager.lists.map(list => <li>{list}</li>)}
            </ol>
        </root>,
        mjolnir.managementRoomId,
        undefined,
        mjolnir.client,
        mjolnir.reactionHandler.createAnnotation(
            PROPAGATION_PROMPT_LISTENER,
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

    public async registerProtection(mjolnir: Mjolnir): Promise<void> {
        const listener: ReactionListener = async (key, item, context: BanPropagationMessageContext) => {
            try {
                if (typeof item === 'string') {
                    const listRef = MatrixRoomReference.fromPermalink(item);
                    const listResult = await findPolicyListFromRoomReference(mjolnir, listRef);
                    if (listResult.isOk()) {
                        return listResult.ok.banEntity(RULE_USER, context.target, context.reason);
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
        };
        mjolnir.reactionHandler.on(PROPAGATION_PROMPT_LISTENER, listener);
    }

    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {
        if (event['type'] !== 'm.room.member' || event['content']?.['membership'] !== 'ban') {
            return;
        }
        if (mjolnir.policyListManager.lists.map(
                list => list.rulesMatchingEntity(event['state_key'], RULE_USER)
            ).some(rules => rules.length > 0)
        ) {
            return; // The user is already banned.
        }
        // do not await, we don't want to block the protection manager
        promptBanPropagation(mjolnir, event, roomId)

    }
}
