/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
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

import { Mjolnir } from "../Mjolnir";
import { RichReply } from "matrix-bot-sdk";
import { htmlEscape, parseDuration } from "../utils";
import { HumanizeDurationLanguage, HumanizeDuration } from "humanize-duration-ts";

const HUMANIZE_LAG_SERVICE: HumanizeDurationLanguage = new HumanizeDurationLanguage();
const HUMANIZER: HumanizeDuration = new HumanizeDuration(HUMANIZE_LAG_SERVICE);


/**
 * Show the most recent joins to a room.
 *
 * Seems like this command never worked how it was expected to
 * "100 day" without quotes is 2 parts, so if you wrote them like the examples
 * then you would have 4 parts?
 *
 * For now I will copy this as it were, but this needs fixing
 * https://github.com/Gnuxie/Draupnir/issues/19
 */
export async function showJoinsStatus(destinationRoomId: string, event: any, mjolnir: Mjolnir, args: string[]) {
    const targetRoomAliasOrId = args[0];
    const maxAgeArg = args[1] || "1 day";
    const maxEntriesArg = args[2] = "200";
    const { html, text } = await (async () => {
        if (!targetRoomAliasOrId) {
            return {
                html: "Missing arg: <code>room id</code>",
                text: "Missing arg: `room id`"
            };
        }
        const maxAgeMS = parseDuration(maxAgeArg);
        if (!maxAgeMS) {
            return {
                html: "Invalid duration. Example: <code>1.5 days</code> or <code>10 minutes</code>",
                text: "Invalid duration. Example: `1.5 days` or `10 minutes`",
            }
        }
        const maxEntries = Number.parseInt(maxEntriesArg, 10);
        if (!maxEntries) {
            return {
                html: "Invalid number of entries. Example: <code>200</code>",
                text: "Invalid number of entries. Example: `200`",
            }
        }
        const minDate = new Date(Date.now() - maxAgeMS);
        const HUMANIZER_OPTIONS = {
            // Reduce "1 day" => "1day" to simplify working with CSV.
            spacer: "",
            // Reduce "1 day, 2 hours" => "1.XXX day" to simplify working with CSV.
            largest: 1,
        };
        const maxAgeHumanReadable = HUMANIZER.humanize(maxAgeMS, HUMANIZER_OPTIONS);
        let targetRoomId;
        try {
            targetRoomId = await mjolnir.client.resolveRoom(targetRoomAliasOrId);
        } catch (ex) {
            return {
                html: `Cannot resolve room ${htmlEscape(targetRoomAliasOrId)}.`,
                text: `Cannot resolve room \`${targetRoomAliasOrId}\`.`
            }
        }
        const joins = mjolnir.roomJoins.getUsersInRoom(targetRoomId, minDate, maxEntries);
        const htmlFragments = [];
        const textFragments = [];
        for (let join of joins) {
            const durationHumanReadable = HUMANIZER.humanize(Date.now() - join.timestamp, HUMANIZER_OPTIONS);
            htmlFragments.push(`<li>${htmlEscape(join.userId)}: ${durationHumanReadable}</li>`);
            textFragments.push(`- ${join.userId}: ${durationHumanReadable}`);
        }
        return {
            html: `${joins.length} recent joins (cut at ${maxAgeHumanReadable} ago / ${maxEntries} entries): <ul> ${htmlFragments.join()} </ul>`,
            text: `${joins.length} recent joins (cut at ${maxAgeHumanReadable} ago / ${maxEntries} entries):\n${textFragments.join("\n")}`
        }
    })();
    const reply = RichReply.createFor(destinationRoomId, event, text, html);
    reply["msgtype"] = "m.notice";
    return mjolnir.client.sendMessage(destinationRoomId, reply);
}
