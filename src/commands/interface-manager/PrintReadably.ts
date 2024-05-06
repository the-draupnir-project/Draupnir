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
        return item.toString()
    }
}
