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

import { Protection } from "./IProtection";
import { Mjolnir } from "../Mjolnir";
import { LogService } from "matrix-bot-sdk";
import { PromptResponseListener } from "../commands/interface-manager/MatrixPromptUX";
import { JSXFactory } from "../commands/interface-manager/JSXFactory";
import { renderMatrixAndSend } from "../commands/interface-manager/DeadDocumentMatrix";
import { renderMentionPill } from "../commands/interface-manager/MatrixHelpRenderer";
import { RULE_USER } from "../models/ListRule";

/**
 * This could not be implemented as a protection for the following reasons:
 * - To enable a protection by default would require a significant refactor
 * - For some reason bans aren't showing in the protection manager via room.event?
 */

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
    return (await renderMatrixAndSend(
        <root>The user {renderMentionPill(event["state_key"], event["content"]?.["displayname"] ?? event["state_key"])} was banned
                in <a href={`https://matrix.to/#/${roomId}`}>{roomId}</a> for <code>{event["content"]?.["reason"] ?? '<no reason supplied>'}</code>.<br/>
                Would you like to add the ban to a policy list?
            <ol>
                {mjolnir.policyListManager.lists.map(list => <li>{list}</li>)}
            </ol>
        </root>,
        mjolnir.managementRoomId,
        undefined,
        mjolnir.client
    )).at(0) as string;
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

    // TODO: for the automated version we should check that the sender is in the management room.
    // TODO: I really want this to be enabled by default.
    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {
        if (event['type'] === 'm.room.member' && event['content']?.['membership'] === 'ban') {
            const promptListener = new PromptResponseListener(
                mjolnir.matrixEmitter,
                await mjolnir.client.getUserId(),
                mjolnir.client
            );
            // do not await, we don't want to block the protection manager
            promptListener.waitForPresentationList(
                mjolnir.policyListManager.lists,
                mjolnir.managementRoomId,
                promptBanPropagation(mjolnir, event, roomId)
            ).then(listResult => {
                if (listResult.isOk()) {
                    const list = listResult.ok;
                    return list.banEntity(RULE_USER, event['state_key'], event['content']?.["reason"]);
                } else {
                    LogService.warn("BanPropagation", "Timed out waiting for a response to a room level ban", listResult.err);
                    return;
                }
            }).catch(e => {
                LogService.error('BanPropagation', "Encountered an error while prompting the user for instructions to propagate a room level ban", e);
            });
        }
    }
}
