/*
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Mjolnir } from "../Mjolnir";
import {LogService, RichReply} from "matrix-bot-sdk";

// !mjolnir find <filter>
export async function execFindCommand(roomId: string, event: any, mjolnir: Mjolnir, parts: string[]) {
    // TODO: maybe make this grab all rooms?
    let rooms = mjolnir.protectedRoomsTracker.getProtectedRooms();
    const userFilter = new RegExp(parts[2]);
    let len = null;
    let offset = 0;

    if (parts.length === 4) { // !mjolnir find <filter> <room>
        rooms = [await mjolnir.client.resolveRoom(parts[3])];
    } else if (parts.length === 5) { // !mjolnir find <filter> <len> <offset>
        len = parseInt(parts[3], 10);
        offset = parseInt(parts[4], 10);
    } else if (parts.length === 6) {  // !mjolnir find <filter> <room> <len> <offset>
        rooms = [await mjolnir.client.resolveRoom(parts[3])];
        len = parseInt(parts[4], 10);
        offset = parseInt(parts[5], 10);
    }

    let users: Array<string> | Set<string> = new Set();

    LogService.debug("execFindCommand", `Finding in ${rooms.length} rooms`);
    for (const targetRoomId of rooms) {
        const joinedUsers = await mjolnir.client.getJoinedRoomMembers(targetRoomId);
        LogService.debug("execFindCommand", `Testing ${joinedUsers.length} from ${targetRoomId}`);
        for (const userId of joinedUsers) {
            // LogService.trace("execFindCommand", `Testing ${userId} with ${userFilter}`);
            if (userFilter.test(userId)) {
                users.add(userId);
            }
        }
    }

    users = Array.from(users);

    if (len !== null) {
        users = users.slice(offset, offset + len)
    }

    let html = `<b>Users found (${users.length}):</b><br/><ul>`;
    let text = `Users found (${users.length}):\n`;

    let hasUsers = false;
    for (const userId of users) {
        hasUsers = true;
        html += `<li><a href="https://matrix.to/#/${userId}">${userId}</a></li>`;
        text += `* ${userId}\n`;
    }

    html += "</ul>";

    if (!hasUsers) {
        html = "No users found";
        text = "No users found";
    }

    const reply = RichReply.createFor(roomId, event, text, html);
    reply["msgtype"] = "m.notice";
    return mjolnir.client.sendMessage(roomId, reply);
}
