// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MatrixEventViaAlias, MatrixEventViaRoomID, MatrixRoomAlias, MatrixRoomID, Permalinks, UserID } from "matrix-protection-suite";
import { ReadItem } from "./CommandReader";

export function printReadably(item: ReadItem): string {
    if (item instanceof MatrixRoomID || item instanceof MatrixRoomAlias) {
        return item.toPermalink();
    } else if (item instanceof UserID) {
        return item.toString();
    } else if (item instanceof MatrixEventViaAlias || item instanceof MatrixEventViaRoomID) {
        return Permalinks.forEvent(item.reference.toRoomIDOrAlias(), item.eventID, item.reference.getViaServers());
    } else {
        // doesn't feel great that we can go to [Object object] from this line
        // At the moment, ReadItems implement their behaviour with toString which
        // obviously sucks because we can't just erorr here when we get something
        // that is likely going to print [Object object].
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return item.toString()
    }
}
