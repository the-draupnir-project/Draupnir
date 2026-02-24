// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { ActionResult } from "../../Interface/Action";

export interface PolicyRoomWatchProfile<T = unknown> {
  room: MatrixRoomID;
  propagation: string;
  options?: T;
}

/**
 * Responsible only for persisting the details of policy list subscription.
 * This is not responsible for the aggregation of policy rooms into a policy
 * list revision.
 */
export interface PolicyListConfig {
  watchList<T>(
    propagation: PropagationType,
    list: MatrixRoomID,
    options: T
  ): Promise<ActionResult<void>>;
  unwatchList(
    propagation: PropagationType,
    list: MatrixRoomID
  ): Promise<ActionResult<void>>;
  readonly allWatchedLists: PolicyRoomWatchProfile[];
}

export enum PropagationType {
  Direct = "direct",
}
